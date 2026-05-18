// Stripe Webhook Handler
// POST /api/stripe/webhook

import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { logAudit, AuditAction, AuditResource } from '@/services/auditLogger'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia',
})

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = (await headers()).get('stripe-signature')!
  
  let event: Stripe.Event
  
  try {
    event = stripe.webhooks.constructEvent(body, signature, WEBHOOK_SECRET)
  } catch (err) {
    console.error('[Stripe] Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }
  
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.userId
      
      if (userId) {
        // Déterminer le plan basé sur le price ID
        const priceId = session.line_items?.data[0]?.price?.id
        let plan: 'STARTER' | 'PRO' | 'BUSINESS' = 'STARTER'
        
        if (priceId === process.env.STRIPE_PRO_PRICE_ID) plan = 'PRO'
        if (priceId === process.env.STRIPE_BUSINESS_PRICE_ID) plan = 'BUSINESS'
        
        // Mettre à jour l'utilisateur
        await prisma.user.update({
          where: { id: userId },
          data: {
            plan,
            // Ajouter des crédits selon le plan
            credits: {
              increment: plan === 'BUSINESS' ? -1 : plan === 'PRO' ? 50000 : 5000,
            },
          },
        })
        
        console.log(`[Stripe] User ${userId} upgraded to ${plan}`)
      }
      break
    }
    
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      // Find user by stripe customer ID
      const user = await prisma.user.findFirst({
        where: { stripeCustomerId: subscription.customer as string },
      })
      
      if (user) {
        // Determine new plan from subscription
        const newPlan = subscription.status === 'active' 
          ? (subscription.items.data[0]?.price.id === process.env.STRIPE_PRO_PRICE_ID ? 'PRO' 
            : subscription.items.data[0]?.price.id === process.env.STRIPE_BUSINESS_PRICE_ID ? 'BUSINESS'
            : 'STARTER')
          : 'FREE'

        await prisma.user.update({
          where: { id: user.id },
          data: { plan: newPlan as any },
        })
        
        console.log(`[Stripe] User ${user.id} plan updated to ${newPlan}`)
      }
      break
    }
    
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      // Revenir à FREE en cas d'annulation
      const user = await prisma.user.findFirst({
        where: { stripeCustomerId: subscription.customer as string },
      })
      
      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: { 
            plan: 'FREE',
            stripeSubscriptionId: null,
          },
        })
        
        // Audit log
        logAudit({
          userId: user.id,
          action: AuditAction.SUBSCRIPTION_CANCELLED,
          resource: AuditResource.SUBSCRIPTION,
          metadata: { subscriptionId: subscription.id },
        })
        
        console.log(`[Stripe] User ${user.id} subscription cancelled, reverted to FREE`)
      }
      break
    }
    
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice
      // Confirmer le paiement et potentiellement ajouter des credits
      console.log('[Stripe] Invoice paid:', invoice.id)
      break
    }
    
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      //Notifier l'utilisateur du problème de paiement
      console.error('[Stripe] Invoice payment failed:', invoice.id)
      break
    }
  }
  
  return NextResponse.json({ received: true })
}