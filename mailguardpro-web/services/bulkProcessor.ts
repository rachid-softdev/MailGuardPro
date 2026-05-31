// Bulk processing service - CSV upload and job management

import { Queue } from "bullmq";
import { parse } from "csv-parse/sync";
import { v4 as uuidv4 } from "uuid";
import { sanitizeForHtml } from "@/lib/emailSanitizer";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

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
  _onProgress?: (processed: number, total: number) => void,
): Promise<BulkUploadResult> {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      success: false,
      errors: [`File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`],
    };
  }

  // Read file content
  let content: string;
  try {
    content = await file.text();
  } catch (error) {
    return {
      success: false,
      errors: ["Failed to read file"],
    };
  }

  // Parse CSV
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

  // Extract emails
  const emails: ParsedEmail[] = [];
  const errors: string[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const email = record.email || record.Email || record.EMAIL || record.mail || record.MAIL;

    if (!email) {
      errors.push(`Row ${i + 1}: No email found`);
      continue;
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push(`Row ${i + 1}: Invalid email format: ${email}`);
      continue;
    }

    emails.push({
      email: email.toLowerCase().trim(),
      firstName: sanitizeForHtml(
        record.firstName || record.first_name || record.firstname || record.prenom || "",
      ),
      lastName: sanitizeForHtml(
        record.lastName || record.last_name || record.lastname || record.nom || "",
      ),
      company: sanitizeForHtml(
        record.company || record.Company || record.societe || record.entreprise || "",
      ),
    });
  }

  // Check limit
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

  // Calculate credit cost
  const creditCost = emails.length;

  const jobId = uuidv4();
  let dbCommitted = false;

  try {
    // 1. DB transaction first — credit deduction + job creation
    await prisma.$transaction(async (tx) => {
      const deduction = await tx.user.updateMany({
        where: { id: userId, credits: { gte: creditCost } },
        data: { credits: { decrement: creditCost } },
      });
      if (deduction.count === 0) throw new Error("Insufficient credits");
      await tx.bulkJob.create({
        data: {
          id: jobId,
          userId,
          filename: file.name,
          totalEmails: emails.length,
          status: "PENDING",
          emailsJson: JSON.stringify(emails), // Store email data in DB (outbox pattern)
        },
      });
    });
    dbCommitted = true;

    // 2. Queue — submit job for processing
    await bulkQueue.add("process", { jobId, totalEmails: emails.length, userId });

    return { success: true, jobId, totalEmails: emails.length };
  } catch (error) {
    console.error("Failed to create bulk job:", error);

    if (error instanceof Error && error.message === "Insufficient credits") {
      return {
        success: false,
        errors: [`Insufficient credits. Required: ${creditCost}`],
      };
    }

    // Compensating rollback: if DB committed but Redis/Queue failed, refund credits and delete job
    if (dbCommitted) {
      await prisma.user
        .update({ where: { id: userId }, data: { credits: { increment: creditCost } } })
        .catch((e: unknown) => console.error("[BulkProcessor] Rollback refund failed:", e));
      await prisma.bulkJob
        .delete({ where: { id: jobId } })
        .catch((e: unknown) =>
          console.error("[BulkProcessor] Compensating rollback: job deletion failed:", e),
        );
    }

    return {
      success: false,
      errors: ["Failed to create processing job"],
    };
  }
}

// Function to get job status
export async function getBulkJobStatus(jobId: string, userId?: string) {
  const where: any = { id: jobId };
  if (userId) where.userId = userId;

  const job = await prisma.bulkJob.findFirst({
    where,
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

// Function to get paginated results
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

// Function to get job stats - Optimized SQL version
// Instead of loading all results in memory, use SQL aggregations
export async function getBulkJobStats(jobId: string) {
  // Query 1: Count total + group by status
  const statusCounts = await prisma.validation.groupBy({
    by: ["status"],
    where: { bulkJobId: jobId },
    _count: {
      status: true,
    },
  });

  // Query 2: Average scores
  const scoreStats = await prisma.validation.aggregate({
    where: { bulkJobId: jobId },
    _avg: {
      score: true,
    },
    _count: {
      score: true,
    },
  });

  // Query 3: Score distribution via raw PostgreSQL query
  // Uses CASE to group by range
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
    // Fallback: use statusCounts data if query fails
    // (ou si ce n'est pas PostgreSQL)
    console.warn("SQL distribution query failed, using fallback:", error);
  }

  // Transform results into object
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

// Function to get results with cursor-based pagination
// More performant than offset for large tables
export async function getBulkJobResultsCursor(jobId: string, cursor?: string, limit = 50) {
  // If no cursor, fetch first items
  const results = await prisma.validation.findMany({
    where: {
      bulkJobId: jobId,
      ...(cursor
        ? {
            id: { lt: cursor }, // assuming cursor is the ID of the last element
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
