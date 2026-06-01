import { NextResponse } from "next/server";
import { type CorsConfig, corsConfig } from "@/config/cors";

export function getCorsHeaders(
  origin: string | null,
  config?: Partial<CorsConfig>,
): Record<string, string> {
  const cfg = { ...corsConfig, ...config };
  const headers: Record<string, string> = {};

  if (origin && cfg.allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  } else if (!origin || origin === "null") {
    headers["Access-Control-Allow-Origin"] = "*";
  } else {
    headers["Access-Control-Allow-Origin"] = cfg.allowedOrigins[0];
  }

  headers["Access-Control-Allow-Methods"] = cfg.allowedMethods.join(", ");
  headers["Access-Control-Allow-Headers"] = cfg.allowedHeaders.join(", ");
  headers["Access-Control-Expose-Headers"] = cfg.exposeHeaders.join(", ");
  headers["Access-Control-Max-Age"] = String(cfg.maxAge);
  headers["Vary"] = "Origin";

  if (cfg.credentials && headers["Access-Control-Allow-Origin"] !== "*") {
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  return headers;
}

export function handleCors(req: Request): NextResponse | null {
  if (req.method !== "OPTIONS") return null;
  const origin = req.headers.get("origin");
  const headers = getCorsHeaders(origin);
  return new NextResponse(null, {
    status: 204,
    headers: { ...headers, "Content-Length": "0" },
  });
}
