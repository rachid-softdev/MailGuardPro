import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not defined')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia',
  typescript: true,
})

// Price IDs (à configurer dans le dashboard Stripe)
export const PRICES = {
  STARTER: process.env.STRIPE_STARTER_PRICE_ID || 'price_starter_monthly',
  PRO: process.env.STRIPE_PRO_PRICE_ID || 'price_pro_monthly',
  BUSINESS: process.env.STRIPE_BUSINESS_PRICE_ID || 'price_business_monthly',
} as const

export type Plan = 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS'

export function getPlanFromPriceId(priceId: string): Plan {
  switch (priceId) {
    case PRICES.STARTER:
      return 'STARTER'
    case PRICES.PRO:
      return 'PRO'
    case PRICES.BUSINESS:
      return 'BUSINESS'
    default:
      return 'FREE'
  }
}

export default stripe