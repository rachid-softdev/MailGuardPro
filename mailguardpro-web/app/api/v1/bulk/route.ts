// API Route: Liste des jobs bulk pour l'utilisateur
// GET /api/v1/bulk

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    // Authentification
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(req.url)
    const limit = parseInt(searchParams.get('limit') || '10')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Récupérer les jobs
    const [jobs, total] = await Promise.all([
      prisma.bulkJob.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          filename: true,
          status: true,
          totalEmails: true,
          processed: true,
          createdAt: true,
          completedAt: true,
        },
      }),
      prisma.bulkJob.count({
        where: { userId: session.user.id },
      }),
    ])

    return NextResponse.json({
      success: true,
      data: jobs,
      meta: {
        total,
        limit,
        offset,
      },
    })
  } catch (error) {
    console.error('[API] Bulk list error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}