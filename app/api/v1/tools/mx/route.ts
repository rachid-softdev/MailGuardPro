// API Route: Outil MX Lookup
// GET /api/v1/tools/mx?domain=xxx

import { NextRequest, NextResponse } from 'next/server'
import dns from 'dns/promises'
import { z } from 'zod'

const querySchema = z.object({
  domain: z.string().min(1).max(253),
})

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const domain = searchParams.get('domain')
    
    const validated = querySchema.safeParse({ domain })
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid domain parameter' },
        { status: 400 }
      )
    }
    
    let mxRecords: dns.MxRecord[] = []
    let error: string | null = null
    
    try {
      mxRecords = await dns.resolveMx(validated.data.domain)
      mxRecords.sort((a, b) => a.priority - b.priority)
    } catch (e) {
      error = (e as Error).message
    }
    
    return NextResponse.json({
      success: true,
      data: {
        domain: validated.data.domain,
        mxRecords: mxRecords.map(r => ({
          host: r.exchange,
          priority: r.priority,
        })),
        hasMx: mxRecords.length > 0,
        error,
      },
    })
  } catch (error) {
    console.error('[API] MX lookup error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}