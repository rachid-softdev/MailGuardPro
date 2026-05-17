// API Route: Modifier/supprimer un webhook
// DELETE /api/v1/webhooks/[id]
// PATCH /api/v1/webhooks/[id]

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const { id } = await params

    // Vérifier que le webhook appartient à l'utilisateur
    const webhook = await prisma.webhook.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    })

    if (!webhook) {
      return NextResponse.json(
        { success: false, error: 'Webhook not found' },
        { status: 404 }
      )
    }

    await prisma.webhook.delete({
      where: { id },
    })

    return NextResponse.json({
      success: true,
    })
  } catch (error) {
    console.error('[API] Webhook delete error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const { id } = await params
    const body = await req.json()

    // Vérifier que le webhook appartient à l'utilisateur
    const webhook = await prisma.webhook.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    })

    if (!webhook) {
      return NextResponse.json(
        { success: false, error: 'Webhook not found' },
        { status: 404 }
      )
    }

    // Mettre à jour seulement les champs envoyés
    const updateData: { isActive?: boolean } = {}
    if (typeof body.isActive === 'boolean') {
      updateData.isActive = body.isActive
    }

    const updated = await prisma.webhook.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        url: updated.url,
        name: updated.name,
        events: updated.events,
        isActive: updated.isActive,
      },
    })
  } catch (error) {
    console.error('[API] Webhook update error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}