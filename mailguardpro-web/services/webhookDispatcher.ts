// Service de dispatch des webhooks sortants

import crypto from "crypto";
import { decryptToken } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { resolveWebhookIps, validateWebhookUrlWithDns } from "@/lib/ssrf";

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
  pinnedIps?: string; // JSON array of IPs
}

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 4000, 8000]; // Backoff exponentiel

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
      console.error(`[Webhook] No pinned IPs for webhook ${webhook.id} — rejecting`);
      return false;
    }

    const url = new URL(webhook.url);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

    const currentResolution = await resolveWebhookIps(hostname);
    if (!currentResolution.valid || !currentResolution.ips) {
      console.error(`[Webhook] DNS resolution failed for ${hostname}: ${currentResolution.error}`);
      return false;
    }

    const storedIps: string[] = JSON.parse(webhook.pinnedIps);
    const currentIps: string[] = currentResolution.ips;

    // Vérifier que les IPs courantes sont toujours dans la liste des IPs stockées
    const hasMismatch = currentIps.some((ip) => !storedIps.includes(ip));
    if (hasMismatch) {
      console.error(
        `[Webhook] DNS REBINDING DETECTED for ${webhook.url}. ` +
          `Stored: [${storedIps.join(", ")}], Current: [${currentIps.join(", ")}]`,
      );
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
          console.log(`Webhook dispatched successfully: ${event} to ${webhook.url}`);
          return true;
        }

        // Log la réponse pour debugging
        console.warn(`Webhook returned non-ok status: ${response.status} ${response.statusText}`);
      } catch (error) {
        lastError = error as Error;
        console.error(`Webhook attempt ${attempt + 1} failed:`, error);
      }

      // Attendre avant le retry
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
      }
    }

    // Tous les retries ont échoué
    console.error(`Webhook dispatch failed after ${MAX_RETRIES} attempts:`, lastError);

    // Ici on pourrait logger dans une table "webhook_logs" pour audit
    return false;
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

    const results = await Promise.allSettled(
      webhooks.map((webhook) =>
        this.dispatch(
          {
            id: webhook.id,
            url: webhook.url,
            secret: webhook.encryptedSecret,
            events: webhook.events,
            isActive: webhook.isActive,
            pinnedIps: webhook.pinnedIps,
          },
          event,
          data,
        ),
      ),
    );

    const successful = results.filter(
      (r): r is PromiseFulfilledResult<boolean> => r.status === "fulfilled" && r.value,
    ).length;

    const failed = results.filter(
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
