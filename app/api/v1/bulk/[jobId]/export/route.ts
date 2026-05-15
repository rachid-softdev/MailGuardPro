// API Route: Export des résultats d'un job bulk
// GET /api/v1/bulk/[jobId]/export?format=csv|json|xlsx|pdf

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { exportResults } from '@/services/exportService'
import { ExportFormat } from '@/services/types'
import { z } from 'zod'

const querySchema = z.object({
  format: z.enum(['csv', 'json', 'xlsx', 'pdf']).default('csv'),
  status: z.string().optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  maxScore: z.coerce.number().min(0).max(100).optional(),
})

const FORMAT_MIME_TYPES: Record<ExportFormat, string> = {
  csv: 'text/csv',
  json: 'application/json',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
}

const FORMAT_EXTENSION: Record<ExportFormat, string> = {
  csv: 'csv',
  json: 'json',
  xlsx: 'xlsx',
  pdf: 'pdf',
}

// Plans requis par format
const PLAN_REQUIREMENTS: Record<ExportFormat, string> = {
  csv: 'FREE',
  json: 'STARTER',
  xlsx: 'PRO',
  pdf: 'PRO',
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    const { searchParams } = new URL(req.url)
    
    // Validation des query params
    const filters = {
      format: searchParams.get('format'),
      status: searchParams.get('status'),
      minScore: searchParams.get('minScore'),
      maxScore: searchParams.get('maxScore'),
    }
    
    const validated = querySchema.safeParse(filters)
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid format parameter' },
        { status: 400 }
      )
    }
    
    const format = validated.data.format as ExportFormat
    
    // Authentification
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }
    
    // Vérifier le plan
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true },
    })
    
    const requiredPlan = PLAN_REQUIREMENTS[format]
    const planOrder = ['FREE', 'STARTER', 'PRO', 'BUSINESS']
    const userPlanIndex = planOrder.indexOf(user?.plan || 'FREE')
    const requiredPlanIndex = planOrder.indexOf(requiredPlan)
    
    if (userPlanIndex < requiredPlanIndex) {
      return NextResponse.json(
        {
          success: false,
          error: 'Upgrade required',
          requiredPlan,
          currentPlan: user?.plan,
        },
        { status: 403 }
      )
    }
    
    // Vérifier que le job existe
    const job = await prisma.bulkJob.findUnique({
      where: { id: jobId },
      select: { userId: true },
    })
    
    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      )
    }
    
    // Préparer les filtres
    const exportFilters = {
      status: validated.data.status?.split(','),
      minScore: validated.data.minScore,
      maxScore: validated.data.maxScore,
    }
    
    // Générer l'export
    const buffer = await exportResults({
      jobId,
      format,
      filters: exportFilters,
    })
    
    // Retourner le fichier
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': FORMAT_MIME_TYPES[format],
        'Content-Disposition': `attachment; filename="mailguard-${jobId}.${FORMAT_EXTENSION[format]}"`,
      },
    })
  } catch (error) {
    console.error('[API] Export error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}