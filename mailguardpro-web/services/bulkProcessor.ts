// Service de traitement bulk - Upload CSV et gestion des jobs

import { prisma } from "@/lib/prisma";
import { publishProgress, redis } from "@/lib/redis";
import { Queue } from "bullmq";
import { parse } from "csv-parse/sync";
import { v4 as uuidv4 } from "uuid";

// BullMQ queue singleton (reused across all uploads)
const bulkQueue = new Queue("bulk-validation", {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
  },
});

// Constantes
const MAX_BULK_ROWS = 100000; // Limite max
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export interface BulkUploadResult {
  success: boolean;
  jobId?: string;
  totalEmails?: number;
  errors?: string[];
}

export interface ParsedEmail {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
}

export async function processBulkUpload(
  file: File,
  userId: string,
  onProgress?: (processed: number, total: number) => void,
): Promise<BulkUploadResult> {
  // Vérifier la taille du fichier
  if (file.size > MAX_FILE_SIZE) {
    return {
      success: false,
      errors: [`File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`],
    };
  }

  // Lire le contenu du fichier
  let content: string;
  try {
    content = await file.text();
  } catch (error) {
    return {
      success: false,
      errors: ["Failed to read file"],
    };
  }

  // Parser le CSV
  let records: Record<string, string>[];
  try {
    records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
  } catch (error) {
    return {
      success: false,
      errors: ["Invalid CSV format"],
    };
  }

  // Extraire les emails
  const emails: ParsedEmail[] = [];
  const errors: string[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const email = record.email || record.Email || record.EMAIL || record.mail || record.MAIL;

    if (!email) {
      errors.push(`Row ${i + 1}: No email found`);
      continue;
    }

    // Validation basique de l'email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push(`Row ${i + 1}: Invalid email format: ${email}`);
      continue;
    }

    emails.push({
      email: email.toLowerCase().trim(),
      firstName: record.firstName || record.first_name || record.firstname || record.prenom,
      lastName: record.lastName || record.last_name || record.lastname || record.nom,
      company: record.company || record.Company || record.company || record.entreprise,
    });
  }

  // Vérifier la limite
  if (emails.length > MAX_BULK_ROWS) {
    return {
      success: false,
      errors: [`Too many emails. Maximum: ${MAX_BULK_ROWS}`],
    };
  }

  if (emails.length === 0) {
    return {
      success: false,
      errors: ["No valid emails found in file"],
    };
  }

  // Créer le job en base de données
  const jobId = uuidv4();

  try {
    await prisma.bulkJob.create({
      data: {
        id: jobId,
        userId,
        filename: file.name,
        totalEmails: emails.length,
        status: "PENDING",
      },
    });

    // Stocker les données du job dans Redis pour le worker
    await redis.setex(`bulk:job:${jobId}:data`, 3600, JSON.stringify(emails));

    // Ajouter à la queue BullMQ (singleton)
    await bulkQueue.add("process", {
      jobId,
      totalEmails: emails.length,
      userId,
    });

    return {
      success: true,
      jobId,
      totalEmails: emails.length,
    };
  } catch (error) {
    console.error("Failed to create bulk job:", error);
    return {
      success: false,
      errors: ["Failed to create processing job"],
    };
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
  });

  if (!job) {
    return null;
  }

  return {
    ...job,
    percentage: job.totalEmails > 0 ? Math.round((job.processed / job.totalEmails) * 100) : 0,
  };
}

// Fonction pour récupérer les résultats paginés
export async function getBulkJobResults(
  jobId: string,
  page = 1,
  limit = 50,
  filters?: {
    status?: string[];
    minScore?: number;
    maxScore?: number;
  },
) {
  const skip = (page - 1) * limit;

  const where: any = { bulkJobId: jobId };

  if (filters?.status && filters.status.length > 0) {
    where.status = { in: filters.status };
  }

  if (filters?.minScore !== undefined) {
    where.score = { ...where.score, gte: filters.minScore };
  }

  if (filters?.maxScore !== undefined) {
    where.score = { ...where.score, lte: filters.maxScore };
  }

  const [results, total] = await Promise.all([
    prisma.validation.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.validation.count({ where }),
  ]);

  return {
    results,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

// Fonction pour obtenir les statistiques du job - Version optimisée SQL
// Au lieu de charger tous les résultats en mémoire, on utilise des agrégations SQL
export async function getBulkJobStats(jobId: string) {
  // Requête 1: Count total + group by status
  const statusCounts = await prisma.validation.groupBy({
    by: ["status"],
    where: { bulkJobId: jobId },
    _count: {
      status: true,
    },
  });

  // Requête 2: Moyenne des scores
  const scoreStats = await prisma.validation.aggregate({
    where: { bulkJobId: jobId },
    _avg: {
      score: true,
    },
    _count: {
      score: true,
    },
  });

  // Requête 3: Distribution des scores via raw query PostgreSQL
  // Utilise CASE pour grouper par range
  let scoreDistribution: Record<string, number> = {
    "0-20": 0,
    "21-40": 0,
    "41-60": 0,
    "61-80": 0,
    "81-100": 0,
  };

  try {
    const distributionResult = await prisma.$queryRaw<{ range: string; count: bigint }[]>`
      SELECT
        CASE
          WHEN score <= 20 THEN '0-20'
          WHEN score <= 40 THEN '21-40'
          WHEN score <= 60 THEN '41-60'
          WHEN score <= 80 THEN '61-80'
          ELSE '81-100'
        END as range,
        COUNT(*) as count
      FROM "Validation"
      WHERE "bulkJobId" = ${jobId}
      GROUP BY range
      ORDER BY range
    `;

    for (const row of distributionResult) {
      scoreDistribution[row.range] = Number(row.count);
    }
  } catch (error) {
    // Fallback: utiliser les données de statusCounts si la query échoue
    // (ou si ce n'est pas PostgreSQL)
    console.warn("SQL distribution query failed, using fallback:", error);
  }

  // Transformer les résultats en objet
  const statusMap = statusCounts.reduce(
    (acc, item) => {
      acc[item.status] = item._count.status;
      return acc;
    },
    {} as Record<string, number>,
  );

  return {
    total: scoreStats._count.score || 0,
    valid: statusMap.valid || 0,
    invalid: statusMap.invalid || 0,
    risky: statusMap.risky || 0,
    unknown: statusMap.unknown || 0,
    avgScore: Math.round(scoreStats._avg.score || 0),
    scoreDistribution,
  };
}

// Fonction pour récupérer les résultats avec cursor-based pagination
// Plus performant que offset pour grandes tables
export async function getBulkJobResultsCursor(jobId: string, cursor?: string, limit = 50) {
  // Si pas de cursor, récupérer les premiers éléments
  const results = await prisma.validation.findMany({
    where: {
      bulkJobId: jobId,
      ...(cursor
        ? {
            id: { lt: cursor }, //假设 cursor est l'ID du dernier élément
          }
        : {}),
    },
    take: limit + 1, // +1 pour savoir s'il y a une page suivante
    orderBy: { createdAt: "desc" },
  });

  const hasNextPage = results.length > limit;
  const items = hasNextPage ? results.slice(0, -1) : results;

  return {
    results: items,
    nextCursor: hasNextPage ? items[items.length - 1]?.id : undefined,
    hasNextPage,
  };
}
