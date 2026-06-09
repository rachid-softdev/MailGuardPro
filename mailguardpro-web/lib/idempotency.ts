// 2-layer idempotency: Redis (fast, 24h TTL) + DB fallback

import { logger } from "./logger";
import { prisma } from "./prisma";
import { redis } from "./redis";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const REDIS_TTL_S = 24 * 60 * 60;

interface IdempotencyRecord {
  response: unknown;
  statusCode: number;
}

export async function getIdempotencyResult(key: string): Promise<IdempotencyRecord | null> {
  // Layer 1: Redis
  try {
    const cached = await redis.get(`idempotency:${key}`);
    if (cached) {
      return JSON.parse(cached) as IdempotencyRecord;
    }
  } catch (error) {
    logger.warn({ error, key }, "Idempotency Redis read failed");
  }

  // Layer 2: Database
  try {
    const record = await prisma.idempotencyKey.findUnique({
      where: { key },
    });
    if (record && record.expiresAt > new Date()) {
      // Populate Redis for future requests
      await redis
        .setex(
          `idempotency:${key}`,
          REDIS_TTL_S,
          JSON.stringify({ response: record.response, statusCode: record.statusCode }),
        )
        .catch(() => {});
      return { response: record.response, statusCode: record.statusCode };
    }
    if (record && record.expiresAt <= new Date()) {
      await prisma.idempotencyKey.delete({ where: { key } }).catch(() => {});
    }
  } catch (error) {
    logger.warn({ error, key }, "Idempotency DB read failed");
  }

  return null;
}

export async function setIdempotencyResult(
  key: string,
  response: unknown,
  statusCode: number,
): Promise<void> {
  const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_MS);

  await prisma.idempotencyKey
    .upsert({
      where: { key },
      update: { response: response as any, statusCode, expiresAt },
      create: { key, response: response as any, statusCode, expiresAt },
    })
    .catch((error: unknown) => {
      logger.warn({ error, key }, "Idempotency DB upsert failed");
    });

  await redis
    .setex(`idempotency:${key}`, REDIS_TTL_S, JSON.stringify({ response, statusCode }))
    .catch(() => {});
}
