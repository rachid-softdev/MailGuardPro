/**
 * H-3 fix: Verify that checkRateLimit is statically imported (no dynamic import).
 *
 * The fix changed `const { checkRateLimit } = await import("@/lib/redis")`
 * to a static `import { checkRateLimit, redis } from "@/lib/redis"`.
 *
 * This test verifies the module imports and compiles correctly by checking
 * the source file directly.
 */
import { describe, expect, it } from "vitest";

describe("Stripe webhook static import (H-3 fix)", () => {
  it("should have checkRateLimit in static imports", async () => {
    // Read the source file to verify static import
    const fs = await import("fs");
    const source = fs.readFileSync("app/api/stripe/webhook/route.ts", "utf-8");

    // Should statically import checkRateLimit from @/lib/redis
    expect(source).toContain('import { checkRateLimit, redis } from "@/lib/redis"');

    // Should NOT have any dynamic import of @/lib/redis
    const dynamicImportPattern = /import\s*\(["']@\/lib\/redis["']\)/;
    expect(source).not.toMatch(dynamicImportPattern);
  });
});
