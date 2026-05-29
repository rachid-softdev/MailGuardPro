import { NextRequest, NextResponse } from "next/server";
import { safeJsonParse } from "./safeJson";

const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;
const STRIPE_MAX_BYTES = 1024 * 1024;

export async function parseJsonBody<T = Record<string, unknown>>(
  req: NextRequest,
  maxBytes = DEFAULT_MAX_BYTES,
): Promise<{ data?: T; error?: NextResponse }> {
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > maxBytes)
    return {
      error: NextResponse.json(
        { success: false, error: "Request body too large" },
        { status: 413 },
      ),
    };
  try {
    const text = await req.text();
    if (text.length > maxBytes)
      return {
        error: NextResponse.json(
          { success: false, error: "Request body too large" },
          { status: 413 },
        ),
      };
    return { data: safeJsonParse<T>(text) };
  } catch {
    return { error: NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }) };
  }
}

export async function parseTextBody(
  req: NextRequest,
  maxBytes = DEFAULT_MAX_BYTES,
): Promise<{ data?: string; error?: NextResponse }> {
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > maxBytes)
    return { error: NextResponse.json({ error: "Request body too large" }, { status: 413 }) };
  try {
    const text = await req.text();
    if (text.length > maxBytes)
      return { error: NextResponse.json({ error: "Request body too large" }, { status: 413 }) };
    return { data: text };
  } catch {
    return { error: NextResponse.json({ error: "Failed to read body" }, { status: 400 }) };
  }
}
