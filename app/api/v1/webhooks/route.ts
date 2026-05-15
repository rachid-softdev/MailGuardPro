// API Route: Gestion des webhooks
// GET /api/v1/webhooks - List
// POST /api/v1/webhooks - Create
// DELETE /api/v1/webhooks/[id] - Delete

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'

const createSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1),
})

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }
    
    const webhooks = await prisma.webhook.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        url: true,
        events: true,
        isActive: true,
        createdAt: true,
      },
    })
    
    return NextResponse.json({ success: true, data: webhooks })
  } catch (error) {
    console.error('[API] Webhooks list error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }
    
    const body = await req.json()
    const validated = createSchema.safeParse(body)
    
    if (!validated.success) {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 })
    }
    
    // Créer le webhook
    const webhook = await prisma.webhook.create({
      data: {
        userId: session.user.id,
        url: validated.data.url,
        events: validated.data.events,
        secret: uuidv4(),
      },
    })
    
    return NextResponse.json({
      success: true,
      data: {
        id: webhook.id,
        url: webhook.url,
        events: webhook.events,
        secret: webhook.secret, // À afficher une seule fois
      },
    })
  } catch (error) {
    console.error('[API] Webhooks create error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}