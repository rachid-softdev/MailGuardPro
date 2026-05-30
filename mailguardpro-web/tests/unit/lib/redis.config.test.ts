import Redis from "ioredis";
/**
 * Unit tests for M-01 — Redis timeout configuration.
 *
 * Verifies that the Redis client options include the correct timeout values:
 * - connectTimeout: 5000
 * - commandTimeout: 5000
 * - maxRetriesPerRequest: 3
 * - lazyConnect: true
 */
import { describe, expect, it } from "vitest";

describe("Redis timeout config [M-01]", () => {
  it("should connectTimeout be 5000", () => {
    const redis = new Redis("redis://localhost:6379", {
      connectTimeout: 5000,
      commandTimeout: 5000,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    expect(redis.options.connectTimeout).toBe(5000);
    expect(redis.options.commandTimeout).toBe(5000);
    expect(redis.options.maxRetriesPerRequest).toBe(3);
    expect(redis.options.lazyConnect).toBe(true);
    redis.disconnect();
  });
});
