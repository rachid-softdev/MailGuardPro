// BullMQ Worker - Traitement des jobs de validation en masse

import { Job, Worker } from "bullmq";
import { hashEmail, maskEmail } from "../lib/emailHash";
import { loggerWorker } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { queueRedis } from "../lib/redis";
import { validateEmail } from "../services/emailValidator";
import {
  createBulkJobCompletedPayload,
  WEBHOOK_EVENTS,
  WebhookDispatcher,
} from "../services/webhookDispatcher";

// Configuration Redis pour le worker — utilise queueRedis (maxRetriesPerRequest: null)
const connection = queueRedis;

// Type pour les données du job
interface BulkJobData {
  jobId: string;
  totalEmails: number;
  userId: string;
  requestId?: string;
}

// Créer le worker
const worker = new Worker<BulkJobData>(
  "bulk-validation",
  async (job: Job<BulkJobData>) => {
    const { jobId, totalEmails, userId, requestId } = job.data;

    loggerWorker.info({ jobId, totalEmails, requestId }, "Starting job");

    // Mettre à jour le statut du job en premier (B-3: éviter lecture avant status)
    await prisma.bulkJob.update({
      where: { id: jobId },
      data: { status: "PROCESSING", startedAt: new Date() },
    });

    // Récupérer les données des emails depuis la base de données (outbox pattern)
    const bulkJobRecord = await prisma.bulkJob.findUnique({
      where: { id: jobId },
      select: { emailsJson: true, processed: true },
    });

    if (!bulkJobRecord?.emailsJson) {
      throw new Error(`No email data found for job ${jobId}`);
    }

    const emails = bulkJobRecord.emailsJson as unknown as {
      email: string;
      firstName?: string;
      lastName?: string;
      company?: string;
    }[];

    // Resume support: skip already-processed emails
    const startIndex = bulkJobRecord.processed || 0;

    const BATCH_SIZE = 50;
    let processed = startIndex;
    const results = {
      valid: 0,
      invalid: 0,
      risky: 0,
      unknown: 0,
    };
    const buffer: Array<{
      email: string;
      emailHash: string;
      score: number;
      status: string;
      checksJson: any;
      processingTimeMs: number;
      userId: string;
      bulkJobId: string;
    }> = [];

    // Traiter chaque email (resume support: skip already-processed emails)
    for (let i = startIndex; i < emails.length; i++) {
      const emailData = emails[i];

      // Validation dans un bloc try-catch séparé du flush (B-1: éviter double increment et corruption du buffer)
      try {
        const validation = await validateEmail(emailData.email);

        // Mettre en mémoire tampon le résultat
        buffer.push({
          email: maskEmail(validation.email),
          emailHash: hashEmail(validation.email),
          score: validation.score,
          status: validation.status,
          checksJson: validation.checks as any,
          processingTimeMs: validation.processingTimeMs,
          userId,
          bulkJobId: jobId,
        });

        // Compter les résultats
        results[validation.status as keyof typeof results]++;
        processed++;
      } catch (error) {
        loggerWorker.error(
          { err: error, email: maskEmail(emailData.email), jobId, requestId },
          "Failed to validate email",
        );
        processed++;

        // Mettre en mémoire tampon l'erreur
        buffer.push({
          email: maskEmail(emailData.email),
          emailHash: hashEmail(emailData.email),
          score: 0,
          status: "unknown",
          checksJson: { error: (error as Error).message },
          processingTimeMs: 0,
          userId,
          bulkJobId: jobId,
        });
      }

      // Flush buffer — encapsulé dans son propre try-catch pour ne pas corrompre processed ni le buffer (B-1)
      if (buffer.length >= BATCH_SIZE) {
        try {
          await prisma.validation.createMany({ data: buffer });
          buffer.length = 0;
        } catch (flushError) {
          loggerWorker.error(
            { err: flushError, jobId, requestId },
            "Batch flush failed, job will be retried via DLQ",
          );
          throw flushError;
        }
      }

      // Mettre à jour le compteur du job toutes les 10 emails
      if (processed % 10 === 0) {
        await prisma.bulkJob.update({
          where: { id: jobId },
          data: { processed },
        });

        // Publier la progression via Redis pub/sub
        await connection.publish(
          `job:${jobId}:progress`,
          JSON.stringify({
            processed,
            total: totalEmails,
            percentage: Math.round((processed / totalEmails) * 100),
          }),
        );
      }
    }

    // Flush remaining buffer
    if (buffer.length > 0) {
      try {
        await prisma.validation.createMany({ data: buffer });
      } catch (flushError) {
        loggerWorker.error(
          { err: flushError, jobId, requestId },
          "Final flush failed, job will be retried via DLQ",
        );
        throw flushError;
      }
    }

    // Job terminé
    await prisma.bulkJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        processed: totalEmails,
        completedAt: new Date(),
      },
    });

    // Dispatcher les webhooks
    try {
      await WebhookDispatcher.dispatchToUser(userId, WEBHOOK_EVENTS.BULK_JOB_COMPLETED, {
        ...createBulkJobCompletedPayload(jobId, totalEmails, results),
      });
    } catch (error) {
      loggerWorker.error({ err: error, jobId, requestId }, "Failed to dispatch webhooks");
    }

    loggerWorker.info({ jobId, requestId, ...results }, "Job completed");

    return {
      processed: totalEmails,
      results,
    };
  },
  {
    connection,
    concurrency: 10, // 10 jobs parallèles
    limiter: {
      max: 10,
      duration: 1000,
    },
  },
);

// Events
worker.on("completed", (job) => {
  const requestId = job.data?.requestId;
  loggerWorker.info({ jobId: job.id, requestId }, "Job completed successfully");
});

worker.on("failed", (job, err) => {
  if (!job) {
    loggerWorker.error(
      { err: { message: err.message } },
      "A job failed with no job data available",
    );
    return;
  }

  const requestId = job.data?.requestId;
  const maxAttempts = job.opts.attempts || 3;
  const isFinalAttempt = job.attemptsMade >= maxAttempts;

  if (isFinalAttempt) {
    loggerWorker.error(
      { err: { message: err.message }, jobId: job.id, requestId, attemptsMade: job.attemptsMade, maxAttempts },
      "Job FAILED after all attempts (sent to DLQ)",
    );
  } else {
    loggerWorker.error(
      { err: { message: err.message }, jobId: job.id, requestId, attemptsMade: job.attemptsMade, maxAttempts },
      "Job failed",
    );
  }

  // Mettre à jour le statut du job uniquement après épuisement des tentatives
  if (isFinalAttempt && job.data?.jobId) {
    prisma.bulkJob
      .update({
        where: { id: job.data.jobId },
        data: { status: "FAILED" },
      })
      .catch((e: unknown) =>
        loggerWorker.error(
          { err: e, jobId: job.data.jobId },
          "Failed to update job status to FAILED",
        ),
      );
  }
});

worker.on("error", (err) => {
  loggerWorker.error({ err }, "Worker error");
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  loggerWorker.info("SIGTERM received, closing gracefully...");
  await worker.close();
  await connection.quit();
  process.exit(0);
});

process.on("SIGINT", async () => {
  loggerWorker.info("SIGINT received, closing gracefully...");
  await worker.close();
  await connection.quit();
  process.exit(0);
});

loggerWorker.info("BullMQ worker started, waiting for jobs...");
