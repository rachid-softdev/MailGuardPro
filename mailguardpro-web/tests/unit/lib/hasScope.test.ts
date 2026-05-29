import { VALID_SCOPES, hasScope } from "@/lib/auth/require-scope";
/**
 * Unit tests for L-03 — Scope-based authorization for API keys.
 *
 * Tests hasScope() function, VALID_SCOPES, and SCOPE_HIERARCHY.
 * No external dependencies — pure logic tests.
 */
import { describe, expect, it } from "vitest";

describe("hasScope() [L-03]", () => {
  // ────────────────────────────────────────────
  // Full scope implies all
  // ────────────────────────────────────────────

  it('should return true for "full" with any required scope', () => {
    expect(hasScope("full", "read")).toBe(true);
    expect(hasScope("full", "validate")).toBe(true);
    expect(hasScope("full", "export")).toBe(true);
    expect(hasScope("full", "full")).toBe(true);
  });

  // ────────────────────────────────────────────
  // Exact match
  // ────────────────────────────────────────────

  it("should return true when single scope matches required", () => {
    expect(hasScope("validate", "validate")).toBe(true);
    expect(hasScope("read", "read")).toBe(true);
    expect(hasScope("export", "export")).toBe(true);
  });

  // ────────────────────────────────────────────
  // No cross-scope access
  // ────────────────────────────────────────────

  it("should return false for read scope trying validate", () => {
    expect(hasScope("read", "validate")).toBe(false);
    expect(hasScope("read", "export")).toBe(false);
    expect(hasScope("validate", "export")).toBe(false);
    expect(hasScope("export", "validate")).toBe(false);
  });

  // ────────────────────────────────────────────
  // Multiple scopes (comma-separated)
  // ────────────────────────────────────────────

  it("should handle comma-separated scopes", () => {
    expect(hasScope("validate,export", "validate")).toBe(true);
    expect(hasScope("validate,export", "export")).toBe(true);
    expect(hasScope("validate,export", "read")).toBe(false);
    expect(hasScope("read,export", "read")).toBe(true);
    expect(hasScope("read,export", "export")).toBe(true);
  });

  it("should handle multi-scope with full included", () => {
    expect(hasScope("full,read", "validate")).toBe(true);
    expect(hasScope("full,read", "export")).toBe(true);
    expect(hasScope("full,export", "read")).toBe(true);
  });

  // ────────────────────────────────────────────
  // Edge cases
  // ────────────────────────────────────────────

  it("should handle empty/undefined scopes", () => {
    expect(hasScope("", "validate")).toBe(false);
    expect(hasScope("", "")).toBe(false);
  });

  it("should handle whitespace in scopes", () => {
    expect(hasScope(" validate , export ", "validate")).toBe(true);
    expect(hasScope(" validate , export ", "export")).toBe(true);
    expect(hasScope("  full  ", "read")).toBe(true);
  });

  it("should handle unknown scopes gracefully", () => {
    expect(hasScope("unknown", "validate")).toBe(false);
    // When both assigned and required are the same unknown scope, the fallback
    // `assigned === requiredScope` returns true (intentional per implementation)
    expect(hasScope("unknown", "unknown")).toBe(true);
  });

  // ────────────────────────────────────────────
  // VALID_SCOPES validation
  // ────────────────────────────────────────────

  it("should have correct VALID_SCOPES", () => {
    expect(VALID_SCOPES).toContain("full");
    expect(VALID_SCOPES).toContain("read");
    expect(VALID_SCOPES).toContain("validate");
    expect(VALID_SCOPES).toContain("export");
    expect(VALID_SCOPES.length).toBe(4);
  });

  it("should have full as the most permissive scope", () => {
    // "full" scope should grant all other scopes
    for (const scope of VALID_SCOPES) {
      expect(hasScope("full", scope)).toBe(true);
    }
  });

  it("should not grant permissions beyond assigned scopes", () => {
    // Separately assigned scopes should not cross-grant
    expect(hasScope("read", "validate")).toBe(false);
    expect(hasScope("read", "export")).toBe(false);
    expect(hasScope("validate", "read")).toBe(false);
    expect(hasScope("validate", "export")).toBe(false);
    expect(hasScope("export", "read")).toBe(false);
    expect(hasScope("export", "validate")).toBe(false);
  });
});
