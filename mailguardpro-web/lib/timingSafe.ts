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
