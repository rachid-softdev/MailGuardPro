// Service de traitement bulk - Upload CSV et gestion des jobs

import { parse } from 'csv-parse/sync'
import { v4 as uuidv4 } from 'uuid'
import { prisma } from '@/lib/prisma'
import { redis, publishProgress } from '@/lib/redis'
import { Queue } from 'bullmq'

// Constantes
const MAX_BULK_ROWS = 100000 // Limite max
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export interface BulkUploadResult {
  success: boolean
  jobId?: string
  totalEmails?: number
  errors?: string[]
}

export interface ParsedEmail {
  email: string
  firstName?: string
  lastName?: string
  company?: string
}

export async function processBulkUpload(
  file: File,
  userId: string,
  onProgress?: (processed: number, total: number) => void
): Promise<BulkUploadResult> {
  // Vérifier la taille du fichier
  if (file.size > MAX_FILE_SIZE) {
    return {
      success: false,
      errors: [`File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`],
    }
  }
  
  // Lire le contenu du fichier
  let content: string
  try {
    content = await file.text()
  } catch (error) {
    return {
      success: false,
      errors: ['Failed to read file'],
    }
  }
  
  // Parser le CSV
  let records: Record<string, string>[]
  try {
    records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    })
  } catch (error) {
    return {
      success: false,
      errors: ['Invalid CSV format'],
    }
  }
  
  // Extraire les emails
  const emails: ParsedEmail[] = []
  const errors: string[] = []
  
  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    const email = record.email || record.Email || record.EMAIL || record.mail || record.MAIL
    
    if (!email) {
      errors.push(`Row ${i + 1}: No email found`)
      continue
    }
    
    // Validation basique de l'email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push(`Row ${i + 1}: Invalid email format: ${email}`)
      continue
    }
    
    emails.push({
      email: email.toLowerCase().trim(),
      firstName: record.firstName || record.first_name || record.firstname || record.prenom,
      lastName: record.lastName || record.last_name || record.lastname || record.nom,
      company: record.company || record.Company || record.company || record.entreprise,
    })
  }
  
  // Vérifier la limite
  if (emails.length > MAX_BULK_ROWS) {
    return {
      success: false,
      errors: [`Too many emails. Maximum: ${MAX_BULK_ROWS}`],
    }
  }
  
  if (emails.length === 0) {
    return {
      success: false,
      errors: ['No valid emails found in file'],
    }
  }
  
  // Créer le job en base de données
  const jobId = uuidv4()
  
  try {
    await prisma.bulkJob.create({
      data: {
        id: jobId,
        userId,
        filename: file.name,
        totalEmails: emails.length,
        status: 'PENDING',
      },
    })
    
    // Stocker les données du job dans Redis pour le worker
    await redis.setex(`bulk:job:${jobId}:data`, 3600, JSON.stringify(emails))
    
    // Ajouter à la queue BullMQ
    const bulkQueue = new Queue('bulk-validation', {
      connection: redis.duplicate(),
    })
    
    await bulkQueue.add('process', {
      jobId,
      totalEmails: emails.length,
      userId,
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    })
    
    return {
      success: true,
      jobId,
      totalEmails: emails.length,
    }
  } catch (error) {
    console.error('Failed to create bulk job:', error)
    return {
      success: false,
      errors: ['Failed to create processing job'],
    }
  }
}

// Fonction pour récupérer le statut d'un job
export async function getBulkJobStatus(jobId: string) {
  const job = await prisma.bulkJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      totalEmails: true,
      processed: true,
      filename: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
    },
  })
  
  if (!job) {
    return null
  }
  
  return {
    ...job,
    percentage: job.totalEmails > 0 ? Math.round((job.processed / job.totalEmails) * 100) : 0,
  }
}

// Fonction pour récupérer les résultats paginés
export async function getBulkJobResults(
  jobId: string,
  page = 1,
  limit = 50,
  filters?: {
    status?: string[]
    minScore?: number
    maxScore?: number
  }
) {
  const skip = (page - 1) * limit
  
  const where: any = { bulkJobId: jobId }
  
  if (filters?.status && filters.status.length > 0) {
    where.status = { in: filters.status }
  }
  
  if (filters?.minScore !== undefined) {
    where.score = { ...where.score, gte: filters.minScore }
  }
  
  if (filters?.maxScore !== undefined) {
    where.score = { ...where.score, lte: filters.maxScore }
  }
  
  const [results, total] = await Promise.all([
    prisma.validation.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.validation.count({ where }),
  ])
  
  return {
    results,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
}

// Fonction pour obtenir les statistiques du job
export async function getBulkJobStats(jobId: string) {
  const results = await prisma.validation.findMany({
    where: { bulkJobId: jobId },
    select: { status: true, score: true },
  })
  
  const stats = {
    total: results.length,
    valid: results.filter(r => r.status === 'valid').length,
    invalid: results.filter(r => r.status === 'invalid').length,
    risky: results.filter(r => r.status === 'risky').length,
    unknown: results.filter(r => r.status === 'unknown').length,
    avgScore: 0,
    scoreDistribution: {
      '0-20': 0,
      '21-40': 0,
      '41-60': 0,
      '61-80': 0,
      '81-100': 0,
    },
  }
  
  if (results.length > 0) {
    stats.avgScore = Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
    
    for (const r of results) {
      if (r.score <= 20) stats.scoreDistribution['0-20']++
      else if (r.score <= 40) stats.scoreDistribution['21-40']++
      else if (r.score <= 60) stats.scoreDistribution['41-60']++
      else if (r.score <= 80) stats.scoreDistribution['61-80']++
      else stats.scoreDistribution['81-100']++
    }
  }
  
  return stats
}