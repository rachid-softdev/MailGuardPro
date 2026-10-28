// Resolve the full address for a bulk validation row.
//
// Validation rows intentionally store a masked address (`j***@example.com`)
// plus a salted hash. The original address is still available in the bulk
// job's outbox (`BulkJob.emailsJson`) for the duration of the job retention
// window. Exports and the bulk results UI use that mapping so users can act on
// the list they uploaded without adding a second plaintext column to every
// validation row.

import { hashEmail } from "@/lib/emailHash";
import { prisma } from "@/lib/prisma";

/** Build a hash → original-address map from a stored emailsJson array. */
export function buildEmailHashMap(records: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(records)) return map;

  for (const record of records) {
    const raw =
      typeof record === "string"
        ? record
        : record && typeof record === "object"
          ? (record as { email?: unknown }).email
          : null;

    if (typeof raw !== "string") continue;
    const email = raw.trim().toLowerCase();
    if (!email.includes("@")) continue;
    map.set(hashEmail(email), email);
  }

  return map;
}

/** Load one job's outbox map. Callers must already have checked ownership. */
export async function getBulkJobEmailMap(jobId: string): Promise<Map<string, string>> {
  const job = await prisma.bulkJob.findUnique({
    where: { id: jobId },
    select: { emailsJson: true },
  });
  return buildEmailHashMap(job?.emailsJson);
}

/** Load maps for several owned jobs (used by history batch export). */
export async function getBulkJobEmailMaps(
  jobIds: string[],
  userId: string,
): Promise<Map<string, Map<string, string>>> {
  if (jobIds.length === 0) return new Map();

  const jobs = await prisma.bulkJob.findMany({
    where: { id: { in: jobIds }, userId },
    select: { id: true, emailsJson: true },
  });

  return new Map(jobs.map((job) => [job.id, buildEmailHashMap(job.emailsJson)]));
}
