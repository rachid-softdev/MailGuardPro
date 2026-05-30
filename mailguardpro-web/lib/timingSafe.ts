import crypto from "node:crypto";

export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  if (bufA.length !== bufB.length) {
    // Compare a dummy to prevent timing leak
    crypto.timingSafeEqual(Buffer.from("a"), Buffer.from("a"));
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

const TARGET_MS = parseInt(process.env.VALIDATION_TARGET_MS || "3000", 10);
const JITTER_MS = 500;

export async function enforceTimingSafeResponse(startTime: number): Promise<void> {
  const elapsed = Date.now() - startTime;
  const jitter = Math.floor(Math.random() * JITTER_MS * 2) - JITTER_MS;
  const waitTime = Math.max(0, TARGET_MS + jitter - elapsed);

  if (waitTime > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }
}
