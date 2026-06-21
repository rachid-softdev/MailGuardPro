import { NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { parseJsonBody, parseTextBody } from "@/lib/request";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal mock of `NextRequest` that only exposes the properties
 * consumed by `parseJsonBody` / `parseTextBody`.
 *
 * @param bodyText        The string that `req.text()` resolves to.
 * @param contentLength   Value returned by `headers.get("content-length")`.
 *                        `null` simulates a missing header.
 * @param shouldThrow     When `true`, `req.text()` rejects instead of resolving.
 */
function createMockRequest(bodyText: string, contentLength: string | null, shouldThrow = false) {
  const mockText = vi
    .fn()
    .mockImplementation(() =>
      shouldThrow
        ? Promise.reject(new Error("simulated network error"))
        : Promise.resolve(bodyText),
    );

  return {
    headers: {
      get: vi.fn((name: string) => {
        if (name === "content-length") return contentLength;
        return null;
      }),
    },
    text: mockText,
  };
}

// ---------------------------------------------------------------------------
// parseJsonBody
// ---------------------------------------------------------------------------

describe("parseJsonBody", () => {
  // ── Success cases ──────────────────────────────────────────────────────

  it("returns parsed object when valid JSON with content-length within limit", async () => {
    const body = JSON.stringify({ name: "test", value: 42 });
    const req = createMockRequest(body, String(body.length));
    const result = await parseJsonBody(req);

    expect(result.data).toEqual({ name: "test", value: 42 });
    expect(result.error).toBeUndefined();
  });

  it("returns parsed array JSON", async () => {
    const body = JSON.stringify([1, 2, 3, 4, 5]);
    const req = createMockRequest(body, String(body.length));
    const result = await parseJsonBody<number[]>(req);

    expect(result.data).toEqual([1, 2, 3, 4, 5]);
    expect(result.error).toBeUndefined();
  });

  it("returns parsed primitive string JSON", async () => {
    const body = JSON.stringify("hello");
    const req = createMockRequest(body, String(body.length));
    const result = await parseJsonBody<string>(req);

    expect(result.data).toBe("hello");
    expect(result.error).toBeUndefined();
  });

  it("returns parsed primitive number JSON", async () => {
    const body = JSON.stringify(42);
    const req = createMockRequest(body, String(body.length));
    const result = await parseJsonBody<number>(req);

    expect(result.data).toBe(42);
    expect(result.error).toBeUndefined();
  });

  it("returns parsed primitive boolean JSON", async () => {
    const body = JSON.stringify(true);
    const req = createMockRequest(body, String(body.length));
    const result = await parseJsonBody<boolean>(req);

    expect(result.data).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("returns parsed null JSON value", async () => {
    const body = JSON.stringify(null);
    const req = createMockRequest(body, String(body.length));
    const result = await parseJsonBody(req);

    expect(result.data).toBeNull();
    expect(result.error).toBeUndefined();
  });

  it("succeeds when content-length header is absent and body is small", async () => {
    const body = JSON.stringify({ id: 1, ok: true });
    const req = createMockRequest(body, null); // no content-length header
    const result = await parseJsonBody(req);

    expect(result.data).toEqual({ id: 1, ok: true });
    expect(result.error).toBeUndefined();
  });

  // ── 413 — content-length exceeds limit ────────────────────────────────

  it("returns 413 NextResponse when content-length exceeds maxBytes", async () => {
    const req = createMockRequest(
      JSON.stringify({ small: true }),
      String(10 * 1024 * 1024), // declares 10 MB
    );
    const result = await parseJsonBody(req, 1024); // limit is 1 KB

    expect(result.data).toBeUndefined();
    expect(result.error).toBeInstanceOf(NextResponse);
    expect(result.error!.status).toBe(413);
    expect(await result.error!.json()).toEqual({
      success: false,
      error: "Request body too large",
    });
  });

  // ── 413 — actual body length exceeds limit ────────────────────────────

  it("returns 413 when actual text length exceeds maxBytes (honest content-length)", async () => {
    const largeBody = "x".repeat(5_000);
    const req = createMockRequest(largeBody, String(largeBody.length));
    const result = await parseJsonBody(req, 200);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeInstanceOf(NextResponse);
    expect(result.error!.status).toBe(413);
  });

  it("returns 413 when actual text length exceeds maxBytes (no content-length)", async () => {
    const largeBody = "x".repeat(5_000);
    const req = createMockRequest(largeBody, null);
    const result = await parseJsonBody(req, 200);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeInstanceOf(NextResponse);
    expect(result.error!.status).toBe(413);
  });

  it("returns 413 when actual text length exceeds default maxBytes (4 MB)", async () => {
    const largeBody = "x".repeat(5 * 1024 * 1024); // 5 MB
    const req = createMockRequest(largeBody, null);
    const result = await parseJsonBody(req);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeInstanceOf(NextResponse);
    expect(result.error!.status).toBe(413);
  });

  // ── 400 — invalid JSON ────────────────────────────────────────────────

  it("returns 400 NextResponse when body is not valid JSON", async () => {
    const req = createMockRequest("not-json-at-all-{broken", "18");
    const result = await parseJsonBody(req);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeInstanceOf(NextResponse);
    expect(result.error!.status).toBe(400);
    expect(await result.error!.json()).toEqual({
      success: false,
      error: "Invalid JSON",
    });
  });

  // ── 400 — req.text() throws ───────────────────────────────────────────

  it("returns 400 when req.text() throws", async () => {
    const req = createMockRequest("", "0", true /* shouldThrow */);
    const result = await parseJsonBody(req);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeInstanceOf(NextResponse);
    expect(result.error!.status).toBe(400);
  });

  // ── 400 — empty body ──────────────────────────────────────────────────

  it("returns 400 when body is empty string", async () => {
    const req = createMockRequest("", "0");
    const result = await parseJsonBody(req);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeInstanceOf(NextResponse);
    expect(result.error!.status).toBe(400);
  });

  // ── Custom maxBytes ────────────────────────────────────────────────────

  it("uses custom maxBytes parameter (rejects body that would pass default)", async () => {
    const body = JSON.stringify({ small: true });
    // content-length is ~15 — fine for default 4 MB, but exceeds custom 10 bytes
    const req = createMockRequest(body, String(body.length));
    const result = await parseJsonBody(req, 10);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeInstanceOf(NextResponse);
    expect(result.error!.status).toBe(413);
  });

  it("accepts body when custom maxBytes is larger than default", async () => {
    const body = JSON.stringify({ data: "x".repeat(5 * 1024 * 1024) }); // ~5 MB string value
    const req = createMockRequest(body, String(body.length));
    // Default is 4 MB, but custom allows 10 MB
    const result = await parseJsonBody(req, 10 * 1024 * 1024);

    expect(result.data).toBeDefined();
    expect(result.error).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parseTextBody
// ---------------------------------------------------------------------------

describe("parseTextBody", () => {
  // ── Success cases ──────────────────────────────────────────────────────

  it("returns text string when within limit", async () => {
    const req = createMockRequest("hello world", "11");
    const result = await parseTextBody(req);

    expect(result.data).toBe("hello world");
    expect(result.error).toBeUndefined();
  });

  it("returns empty string when body is empty and within limit", async () => {
    const req = createMockRequest("", "0");
    const result = await parseTextBody(req);

    expect(result.data).toBe("");
    expect(result.error).toBeUndefined();
  });

  it("succeeds when content-length header is absent and body is small", async () => {
    const req = createMockRequest("plain text body here", null);
    const result = await parseTextBody(req);

    expect(result.data).toBe("plain text body here");
    expect(result.error).toBeUndefined();
  });

  // ── 413 — content-length exceeds limit ────────────────────────────────

  it("returns 413 when content-length exceeds maxBytes", async () => {
    const req = createMockRequest("small", String(10 * 1024 * 1024));
    const result = await parseTextBody(req, 100);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeInstanceOf(NextResponse);
    expect(result.error!.status).toBe(413);
    expect(await result.error!.json()).toEqual({
      error: "Request body too large",
    });
  });

  // ── 413 — actual body length exceeds limit ────────────────────────────

  it("returns 413 when actual text length exceeds maxBytes (honest content-length)", async () => {
    const largeBody = "x".repeat(5_000);
    const req = createMockRequest(largeBody, String(largeBody.length));
    const result = await parseTextBody(req, 200);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeInstanceOf(NextResponse);
    expect(result.error!.status).toBe(413);
  });

  it("returns 413 when actual text length exceeds maxBytes (no content-length)", async () => {
    const largeBody = "x".repeat(5_000);
    const req = createMockRequest(largeBody, null);
    const result = await parseTextBody(req, 200);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeInstanceOf(NextResponse);
    expect(result.error!.status).toBe(413);
  });

  it("returns 413 when actual text length exceeds default maxBytes (4 MB)", async () => {
    const largeBody = "x".repeat(5 * 1024 * 1024); // 5 MB
    const req = createMockRequest(largeBody, null);
    const result = await parseTextBody(req);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeInstanceOf(NextResponse);
    expect(result.error!.status).toBe(413);
  });

  // ── 400 — req.text() throws ───────────────────────────────────────────

  it("returns 400 when req.text() throws", async () => {
    const req = createMockRequest("", "0", true /* shouldThrow */);
    const result = await parseTextBody(req);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeInstanceOf(NextResponse);
    expect(result.error!.status).toBe(400);
    expect(await result.error!.json()).toEqual({
      error: "Failed to read body",
    });
  });

  // ── Custom maxBytes ────────────────────────────────────────────────────

  it("uses custom maxBytes parameter", async () => {
    const body = "this body is longer than ten bytes";
    const req = createMockRequest(body, String(body.length));
    const result = await parseTextBody(req, 10);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeInstanceOf(NextResponse);
    expect(result.error!.status).toBe(413);
  });

  it("accepts body when custom maxBytes is larger than body", async () => {
    const body = "short";
    const req = createMockRequest(body, String(body.length));
    const result = await parseTextBody(req, 100);

    expect(result.data).toBe("short");
    expect(result.error).toBeUndefined();
  });
});
