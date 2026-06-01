// API Route: Outil DMARC Lookup
// GET /api/v1/tools/dmarc?domain=xxx

import dns from "dns/promises";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { loggerApi } from "@/lib/logger";
import { checkRateLimit } from "@/lib/redis";
import { getClientIp } from "@/lib/ssrf";

const querySchema = z.object({
  domain: z.string().min(1).max(253),
});

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rateCheck = await checkRateLimit(`tools:ip:${ip}`, 30, 60);

    if (!rateCheck.success) {
      return NextResponse.json(
        { success: false, error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }

    const { searchParams } = new URL(req.url);
    const domain = searchParams.get("domain");

    const validated = querySchema.safeParse({ domain });
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: "Invalid domain parameter" },
        { status: 400 },
      );
    }

    let dmarcRecord: string | null = null;
    let error: string | null = null;

    try {
      const txtRecords = await dns.resolveTxt(`_dmarc.${validated.data.domain}`);
      for (const record of txtRecords) {
        const recordStr = record.join("");
        if (recordStr.includes("v=DMARC1")) {
          dmarcRecord = recordStr;
          break;
        }
      }
    } catch (e) {
      error = (e as Error).message;
    }

    return NextResponse.json({
      success: true,
      data: {
        domain: validated.data.domain,
        dmarcRecord,
        hasDmarc: dmarcRecord !== null,
        error,
      },
    });
  } catch (error) {
    loggerApi.error({ err: error }, "DMARC lookup error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
