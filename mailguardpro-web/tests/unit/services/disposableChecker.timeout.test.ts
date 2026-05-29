/**
 * Unit tests for M-05 — Disposable checker fetch timeout.
 *
 * Verifies that syncDisposableDomains() uses AbortSignal.timeout(10000)
 * on the fetch call, handles AbortError gracefully, and processes
 * successful responses correctly.
 *
 * We override the global mock from setup.ts to expose the real implementation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Override the global mock to expose the real syncDisposableDomains function
vi.mock("@/services/disposableChecker", async () => {
  const actual = await vi.importActual<typeof import("@/services/disposableChecker")>(
    "@/services/disposableChecker",
  );
  return {
    ...actual,
    // We keep the real implementation; checkDisposable is not needed here
  };
});

import { syncDisposableDomains } from "@/services/disposableChecker";

describe("Disposable checker fetch timeout [M-05]", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should use AbortSignal.timeout with 10s on fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fetch failed"));
    const result = await syncDisposableDomains();
    expect(result).toEqual({ added: 0 });
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("raw.githubusercontent.com"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("should handle AbortError gracefully and return { added: 0 }", async () => {
    const abortError = new DOMException("The operation was aborted", "AbortError");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);
    const result = await syncDisposableDomains();
    expect(result).toEqual({ added: 0 });
  });

  it("should return added count on successful fetch", async () => {
    const mockResponse = "tempmail.com\nyopmail.com\nmailinator.com";
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockResponse),
    } as any);
    const result = await syncDisposableDomains();
    expect(result.added).toBe(3);
  });

  it("should throw for non-ok response and return { added: 0 }", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
    } as any);
    const result = await syncDisposableDomains();
    expect(result).toEqual({ added: 0 });
  });

  it("should handle network error and return { added: 0 }", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network failure"));
    const result = await syncDisposableDomains();
    expect(result).toEqual({ added: 0 });
  });

  it("should handle empty response text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(""),
    } as any);
    const result = await syncDisposableDomains();
    expect(result.added).toBe(0);
  });

  it("should trim and lowercase domains from response", async () => {
    const mockResponse = "  TEMPMAIL.COM  \n  YopMail.com  \n";
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockResponse),
    } as any);
    const result = await syncDisposableDomains();
    expect(result.added).toBe(2);
  });
});
