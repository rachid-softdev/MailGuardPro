// Service de dispatch des webhooks sortants

import crypto from "crypto";
import { prisma } from "@/lib/prisma";

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

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    const signature = this.generateSignature(payload, webhook.secret);

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

    const results = await Promise.all(
      webhooks.map((webhook) =>
        this.dispatch(
          {
            id: webhook.id,
            url: webhook.url,
            secret: webhook.secret,
            events: webhook.events,
            isActive: webhook.isActive,
          },
          event,
          data,
        ),
      ),
    );

    return {
      total: webhooks.length,
      successful: results.filter((r) => r).length,
      failed: results.filter((r) => !r).length,
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
