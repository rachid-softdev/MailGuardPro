// Cron: Check low credits and notify users
// Runs daily to check users with low credits and potentially notify them

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logAudit, AuditAction, AuditResource } from '@/services/auditLogger'

const CRON_SECRET = process.env.CRON_SECRET
const LOW_CREDITS_THRESHOLD = 10

export async function GET(req: NextRequest) {
  // Verify cron authorization
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${CRON_SECRET}` && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    console.log('[Cron] Starting low credits check...')
    
    // Find users with low credits (but not free plan, they get what they get)
    const usersWithLowCredits = await prisma.user.findMany({
      where: {
        credits: { lte: LOW_CREDITS_THRESHOLD },
        plan: { not: 'FREE' },
      },
      select: {
        id: true,
        email: true,
        credits: true,
        plan: true,
      },
    })

    console.log(`[Cron] Found ${usersWithLowCredits.length} users with low credits`)
    
    // In production, this would send emails via Resend
    // For now, just log and return the list
    if (process.env.NODE_ENV === 'production') {
      for (const user of usersWithLowCredits) {
        console.log(`[Cron] User ${user.id} (${user.email}) has ${user.credits} credits left on ${user.plan} plan`)
        
        // Log for potential email sending
        await logAudit({
          userId: user.id,
          action: AuditAction.CREDITS_CONSUMED,
          resource: AuditResource.USER,
          metadata: {
            event: 'LOW_CREDITS_WARNING',
            creditsRemaining: user.credits,
            plan: user.plan,
          },
        })
      }
    }

    return NextResponse.json({
      success: true,
      usersNotified: usersWithLowCredits.length,
      users: usersWithLowCredits.map(u => ({
        id: u.id,
        email: u.email,
        credits: u.credits,
        plan: u.plan,
      })),
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Cron] Low credits check failed:', error)
    return NextResponse.json(
      { success: false, error: 'Check failed' },
      { status: 500 }
    )
  }
}