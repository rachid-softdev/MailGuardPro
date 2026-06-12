// Service de dispatch des webhooks sortants

import crypto from "crypto";
import { decryptToken } from "@/lib/crypto";
import { loggerWebhook } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { resolveWebhookIps } from "@/lib/ssrf";

export interface WebhookPayload {
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface WebhookConfig {
  id: string;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
  pinnedIps?: string[]; // IPs resolved at creation time
}

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 4000, 8000]; // Backoff exponentiel

function withJitter(delayMs: number): number {
  const jitter = delayMs * 0.2; // ±20%
  return Math.max(100, delayMs + Math.floor(Math.random() * jitter * 2) - jitter);
}

function batch<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

export class WebhookDispatcher {
  // Dispatcher un webhook spécifique
  static async dispatch(
    webhook: WebhookConfig,
    event: string,
    data: Record<string, unknown>,
  ): Promise<boolean> {
    if (!webhook.isActive || !webhook.events.includes(event)) {
      return false;
    }

    // DNS Pinning : re-résoudre et comparer avec les IPs stockées
    if (!webhook.pinnedIps) {
      loggerWebhook.error({ webhookId: webhook.id }, "No pinned IPs for webhook — rejecting");
      return false;
    }

    const url = new URL(webhook.url);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

    const currentResolution = await resolveWebhookIps(hostname);
    if (!currentResolution.valid || !currentResolution.ips) {
      loggerWebhook.error({ hostname, error: currentResolution.error }, "DNS resolution failed");
      return false;
    }

    const storedIps = webhook.pinnedIps;
    const currentIps: string[] = currentResolution.ips;

    // Vérifier que les IPs courantes sont toujours dans la liste des IPs stockées
    const hasMismatch = currentIps.some((ip) => !storedIps.includes(ip));
    if (hasMismatch) {
      loggerWebhook.error({ url: webhook.url, storedIps, currentIps }, "DNS REBINDING DETECTED");
      // En production, on bloque. En dev, on log juste.
      if (process.env.NODE_ENV === "production") {
        return false;
      }
    }

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    // Decrypt the stored secret before signing
    const rawSecret = decryptToken(webhook.secret);
    const signature = this.generateSignature(payload, rawSecret);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(webhook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-MailGuard-Signature": signature,
            "X-MailGuard-Event": event,
            "X-MailGuard-Timestamp": payload.timestamp,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000), // 10s timeout
          redirect: "manual", // Prevent SSRF via redirect chains
        });

        if (response.ok) {
          loggerWebhook.info({ event, url: webhook.url }, "Webhook dispatched successfully");

          // Record successful delivery
          await this.persistDelivery(webhook, event, payload, {
            status: "success",
            statusCode: response.status,
            requestBody: payload,
          });

          return true;
        }

        // Log la réponse pour debugging
        loggerWebhook.warn(
          { status: response.status, statusText: response.statusText, url: webhook.url, event },
          "Webhook returned non-ok status",
        );
      } catch (error) {
        lastError = error as Error;
        loggerWebhook.error(
          { err: error, attempt: attempt + 1, url: webhook.url },
          "Webhook attempt failed",
        );
      }

      // Attendre avant le retry (with jitter to avoid thundering herd)
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, withJitter(RETRY_DELAYS[attempt])));
      }
    }

    // Tous les retries ont échoué
    loggerWebhook.error(
      { err: lastError, maxRetries: MAX_RETRIES, url: webhook.url },
      "Webhook dispatch failed after all attempts",
    );

    // Enregistrer l'échec dans la table de livraison
    await this.persistDelivery(webhook, event, payload, {
      status: "failed",
      error: lastError?.message || "Unknown error",
      requestBody: payload,
    });

    return false;
  }

  // Persist a delivery record in the database (for DLQ audit trail)
  private static async persistDelivery(
    webhook: WebhookConfig,
    event: string,
    data: unknown,
    result: {
      status: "success" | "failed";
      statusCode?: number | null;
      responseBody?: string | null;
      durationMs?: number | null;
      error?: string | null;
      requestBody?: unknown;
    },
  ): Promise<void> {
    try {
      await prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          event,
          url: webhook.url,
          status: result.status,
          statusCode: result.statusCode ?? null,
          requestBody: result.requestBody ?? (data as Record<string, unknown>),
          responseBody: result.responseBody ?? null,
          durationMs: result.durationMs ?? null,
          error: result.error ?? null,
        },
      });
    } catch (err) {
      loggerWebhook.error({ err, webhookId: webhook.id }, "Failed to persist delivery record");
    }
  }

  // Dispatcher à tous les webhooks d'un utilisateur pour un événement donné
  static async dispatchToUser(userId: string, event: string, data: Record<string, unknown>) {
    const webhooks = await prisma.webhook.findMany({
      where: {
        userId,
        isActive: true,
        events: { has: event },
      },
    });

    // Rate-limit: process webhooks in batches of 5 to avoid overwhelming the outgoing connection pool
    const CONCURRENCY = 5;
    type WebhookRecord = (typeof webhooks)[number];
    const chunks: WebhookRecord[][] = batch(webhooks, CONCURRENCY);
    const allResults: PromiseSettledResult<boolean>[] = [];

    for (const chunk of chunks) {
      const chunkResults = await Promise.allSettled(
        chunk.map((webhook) =>
          this.dispatch(
            {
              id: webhook.id,
              url: webhook.url,
              secret: webhook.encryptedSecret,
              events: webhook.events,
              isActive: webhook.isActive,
              pinnedIps: webhook.pinnedIps
                ? String(webhook.pinnedIps)
                    .split(",")
                    .map((s: string) => s.trim())
                : undefined,
            },
            event,
            data,
          ),
        ),
      );
      allResults.push(...chunkResults);
    }

    const successful = allResults.filter(
      (r): r is PromiseFulfilledResult<boolean> => r.status === "fulfilled" && r.value,
    ).length;

    const failed = allResults.filter(
      (r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value),
    ).length;

    return {
      total: webhooks.length,
      successful,
      failed,
    };
  }

  // Générer la signature HMAC-SHA256
  private static generateSignature(payload: WebhookPayload, secret: string): string {
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(JSON.stringify(payload));
    return hmac.digest("hex");
  }

  // Vérifier une signature webhook entrante (pour les webhooks de Stripe, etc.)
  static verifyIncomingSignature(payload: string, signature: string, secret: string): boolean {
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }
}

// Événements webhook disponibles
export const WEBHOOK_EVENTS = {
  BULK_JOB_COMPLETED: "bulk_job_completed",
  BULK_JOB_FAILED: "bulk_job_failed",
  DAILY_REPORT: "daily_report",
  CREDIT_LOW: "credit_low",
  PLAN_UPGRADED: "plan_upgraded",
  PLAN_EXPIRED: "plan_expired",
} as const;

// Helper pour créer un payload de job completed
export function createBulkJobCompletedPayload(
  jobId: string,
  totalEmails: number,
  results: { valid: number; invalid: number; risky: number },
) {
  return {
    jobId,
    totalEmails,
    results,
    deliveredRate: Math.round((results.valid / totalEmails) * 100),
    timestamp: new Date().toISOString(),
  };
}
