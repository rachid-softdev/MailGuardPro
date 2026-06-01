import { NextResponse } from "next/server";
import { openApiSpec } from "@/lib/openapi";

export async function GET() {
  return NextResponse.json(openApiSpec, {
    headers: { "Cache-Control": "public, s-maxage=3600" },
  });
}
