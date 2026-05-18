// BullMQ Worker - Traitement des jobs de validation en masse

import { Worker, Job } from 'bullmq'
import Redis from 'ioredis'
import { validateEmail } from '../services/emailValidator'
import { prisma } from '../lib/prisma'
import { WebhookDispatcher, createBulkJobCompletedPayload, WEBHOOK_EVENTS } from '../services/webhookDispatcher'

// Configuration Redis pour le worker
const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // Nécessaire pour BullMQ
})

// Type pour les données du job
interface BulkJobData {
  jobId: string
  totalEmails: number
  userId: string
}

// Créer le worker
const worker = new Worker<BulkJobData>(
  'bulk-validation',
  async (job: Job<BulkJobData>) => {
    const { jobId, totalEmails, userId } = job.data
    
    console.log(`[Worker] Starting job ${jobId} for ${totalEmails} emails`)
    
    // Récupérer les données des emails depuis Redis
    const jobDataKey = `bulk:job:${jobId}:data`
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')
    
    const dataStr = await redis.get(jobDataKey)
    if (!dataStr) {
      throw new Error(`No data found for job ${jobId}`)
    }
    
    const emails = JSON.parse(dataStr) as { email: string; firstName?: string; lastName?: string; company?: string }[]
    
    // Mettre à jour le statut du job
    await prisma.bulkJob.update({
      where: { id: jobId },
      data: { status: 'PROCESSING', startedAt: new Date() },
    })
    
    let processed = 0
    const results = {
      valid: 0,
      invalid: 0,
      risky: 0,
      unknown: 0,
    }
    
    // Traiter chaque email
    for (const emailData of emails) {
      try {
        const validation = await validateEmail(emailData.email)
        
        // Sauvegarder le résultat en base
        await prisma.validation.create({
          data: {
            email: validation.email,
            score: validation.score,
            status: validation.status,
            checksJson: validation.checks as any,
            processingTimeMs: validation.processingTimeMs,
            userId,
            bulkJobId: jobId,
          },
        })
        
        // Compter les résultats
        results[validation.status as keyof typeof results]++
        processed++
        
        // Mettre à jour le compteur du job toutes les 10 emails
        if (processed % 10 === 0) {
          await prisma.bulkJob.update({
            where: { id: jobId },
            data: { processed },
          })
          
          // Publier la progression via Redis pub/sub
          await redis.publish(
            `job:${jobId}:progress`,
            JSON.stringify({
              processed,
              total: totalEmails,
              percentage: Math.round((processed / totalEmails) * 100),
            })
          )
        }
      } catch (error) {
        console.error(`[Worker] Failed to validate ${emailData.email}:`, error)
        processed++
        
        // Enregistrer comme erreur
        await prisma.validation.create({
          data: {
            email: emailData.email,
            score: 0,
            status: 'unknown',
            checksJson: { error: (error as Error).message },
            processingTimeMs: 0,
            userId,
            bulkJobId: jobId,
          },
        })
      }
    }
    
    // Job terminé
    await prisma.bulkJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        processed: totalEmails,
        completedAt: new Date(),
      },
    })
    
    // Nettoyer Redis
    await redis.del(jobDataKey)
    
    // Dispatcher les webhooks
    try {
      await WebhookDispatcher.dispatchToUser(userId, WEBHOOK_EVENTS.BULK_JOB_COMPLETED, {
        ...createBulkJobCompletedPayload(jobId, totalEmails, results),
      })
    } catch (error) {
      console.error('[Worker] Failed to dispatch webhooks:', error)
    }
    
    console.log(`[Worker] Job ${jobId} completed: ${results.valid} valid, ${results.invalid} invalid, ${results.risky} risky`)
    
    return {
      processed: totalEmails,
      results,
    }
  },
  {
    connection,
    concurrency: 10, // 10 jobs parallèles
    limiter: {
      max: 10,
      duration: 1000,
    },
  }
)

// Events
worker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed successfully`)
})

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err.message)
  
  // Mettre à jour le statut du job en cas d'échec
  if (job?.data?.jobId) {
    prisma.bulkJob.update({
      where: { id: job.data.jobId },
      data: { status: 'FAILED' },
    }).catch(console.error)
  }
})

worker.on('error', (err) => {
  console.error('[Worker] Worker error:', err)
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Worker] SIGTERM received, closing gracefully...')
  await worker.close()
  await connection.quit()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('[Worker] SIGINT received, closing gracefully...')
  await worker.close()
  await connection.quit()
  process.exit(0)
})

console.log('[Worker] BullMQ worker started, waiting for jobs...')