import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not defined");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-02-24.acacia",
  typescript: true,
});

// Price IDs (à configurer dans le dashboard Stripe)
export const PRICES = {
  STARTER: process.env.STRIPE_STARTER_PRICE_ID,
  PRO: process.env.STRIPE_PRO_PRICE_ID,
  BUSINESS: process.env.STRIPE_BUSINESS_PRICE_ID,
} as const;

// Valider que tous les price IDs sont configurés
if (!PRICES.STARTER || !PRICES.PRO || !PRICES.BUSINESS) {
  throw new Error(
    "STRIPE_STARTER_PRICE_ID, STRIPE_PRO_PRICE_ID, and STRIPE_BUSINESS_PRICE_ID must be defined",
  );
}

export type Plan = "FREE" | "STARTER" | "PRO" | "BUSINESS";

export function getPlanFromPriceId(priceId: string): Plan | null {
  switch (priceId) {
    case PRICES.STARTER:
      return "STARTER";
    case PRICES.PRO:
      return "PRO";
    case PRICES.BUSINESS:
      return "BUSINESS";
    default:
      return null;
  }
}

export default stripe;
