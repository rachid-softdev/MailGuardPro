import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not defined");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-06-24.dahlia",
  typescript: true,
});

// Price IDs (à configurer dans le dashboard Stripe)
export const PRICES = {
  STARTER: process.env.STRIPE_STARTER_PRICE_ID,
  PRO: process.env.STRIPE_PRO_PRICE_ID,
  BUSINESS: process.env.STRIPE_BUSINESS_PRICE_ID,
} as const;

// Annual price IDs are OPTIONAL: when unset, annual checkout is disabled and
// /api/v1/billing/checkout returns a clear 400 instead of failing.
export const PRICES_ANNUAL = {
  STARTER: process.env.STRIPE_STARTER_ANNUAL_PRICE_ID,
  PRO: process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
  BUSINESS: process.env.STRIPE_BUSINESS_ANNUAL_PRICE_ID,
} as const;

// Valider que tous les price IDs sont configurés
if (!PRICES.STARTER || !PRICES.PRO || !PRICES.BUSINESS) {
  throw new Error(
    "STRIPE_STARTER_PRICE_ID, STRIPE_PRO_PRICE_ID, and STRIPE_BUSINESS_PRICE_ID must be defined",
  );
}

export type Plan = "FREE" | "STARTER" | "PRO" | "BUSINESS";

// Maps both monthly and annual (when configured) price IDs to their plan.
export function getPlanFromPriceId(priceId: string): Plan | null {
  if (!priceId) return null; // annual IDs may be unset → never match undefined

  const mappings: Array<[string | undefined, Plan]> = [
    [PRICES.STARTER, "STARTER"],
    [PRICES_ANNUAL.STARTER, "STARTER"],
    [PRICES.PRO, "PRO"],
    [PRICES_ANNUAL.PRO, "PRO"],
    [PRICES.BUSINESS, "BUSINESS"],
    [PRICES_ANNUAL.BUSINESS, "BUSINESS"],
  ];

  for (const [id, plan] of mappings) {
    if (id && id === priceId) return plan;
  }
  return null;
}

export default stripe;
