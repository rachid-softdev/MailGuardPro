import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: "admin@mailguardpro.com" },
    update: {
      role: "ADMIN",
      userRoles: {
        deleteMany: {},
        create: [{ role: "ADMIN" }, { role: "USER" }],
      },
    },
    create: {
      email: "admin@mailguardpro.com",
      name: "Admin",
      role: "ADMIN",
      credits: 999999,
      userRoles: {
        create: [{ role: "ADMIN" }, { role: "USER" }],
      },
    },
  });

  console.log("Admin user created:", admin.email);

  // ================================================================
  // Feature Flags + Entitlements Seed
  // ================================================================

  // Create features
  const features = [
    {
      key: "EXPORT_PDF",
      description: "Export emails to PDF",
      type: "BOOLEAN" as const,
      defaultConfig: {},
    },
    {
      key: "AI_SUMMARY",
      description: "AI-powered email summary",
      type: "BOOLEAN" as const,
      defaultConfig: {},
    },
    {
      key: "BULK_VALIDATE",
      description: "Bulk email validation credits",
      type: "LIMIT" as const,
      defaultConfig: {},
    },
    {
      key: "API_ACCESS",
      description: "REST API access",
      type: "BOOLEAN" as const,
      defaultConfig: {},
    },
    {
      key: "TEAM_MEMBERS",
      description: "Number of team members",
      type: "LIMIT" as const,
      defaultConfig: {},
    },
    {
      key: "CUSTOM_HEADERS",
      description: "Custom email headers",
      type: "BOOLEAN" as const,
      defaultConfig: {},
    },
    {
      key: "WEBHOOKS",
      description: "Webhook integrations",
      type: "BOOLEAN" as const,
      defaultConfig: {},
    },
    {
      key: "SCHEDULED_EXPORTS",
      description: "Scheduled automated exports",
      type: "BOOLEAN" as const,
      defaultConfig: {},
    },
    {
      key: "NEW_DASHBOARD",
      description: "New dashboard experience (A/B test)",
      type: "EXPERIMENT" as const,
      defaultConfig: { percentage: 50, seed: "NEW_DASHBOARD_v1" },
    },
    {
      key: "ADVANCED_FILTERS",
      description: "Advanced filter operators",
      type: "BOOLEAN" as const,
      defaultConfig: {},
    },
    {
      key: "WHITELABEL",
      description: "White-label exports",
      type: "BOOLEAN" as const,
      defaultConfig: {},
    },
    {
      key: "PRIORITY_SUPPORT",
      description: "Priority customer support",
      type: "BOOLEAN" as const,
      defaultConfig: {},
    },
  ];

  console.log("Seeding features...");
  for (const f of features) {
    await prisma.feature.upsert({
      where: { key: f.key },
      update: { description: f.description, type: f.type, defaultConfig: f.defaultConfig },
      create: {
        key: f.key,
        description: f.description,
        type: f.type,
        defaultConfig: f.defaultConfig,
      },
    });
  }
  console.log(`  ✓ ${features.length} features seeded`);

  // Create pricing plans
  const plans = [
    { key: "FREE", name: "Free", priceMonthly: 0, stripePriceId: null },
    {
      key: "STARTER",
      name: "Starter",
      priceMonthly: 1900,
      stripePriceId: process.env.STRIPE_STARTER_PRICE_ID ?? null,
    },
    {
      key: "PRO",
      name: "Professional",
      priceMonthly: 2900,
      stripePriceId: process.env.STRIPE_PRO_PRICE_ID ?? null,
    },
    {
      key: "BUSINESS",
      name: "Business",
      priceMonthly: 9900,
      stripePriceId: process.env.STRIPE_BUSINESS_PRICE_ID ?? null,
    },
  ];

  console.log("Seeding plans...");
  for (const p of plans) {
    await prisma.pricingPlan.upsert({
      where: { key: p.key },
      update: { name: p.name, priceMonthly: p.priceMonthly, stripePriceId: p.stripePriceId },
      create: {
        key: p.key,
        name: p.name,
        priceMonthly: p.priceMonthly,
        stripePriceId: p.stripePriceId,
      },
    });
  }
  console.log(`  ✓ ${plans.length} plans seeded`);

  // Map features to plans
  const planFeatureMap: Record<
    string,
    Array<{ key: string; enabled: boolean; limit?: number | null; strategy?: string }>
  > = {
    FREE: [
      { key: "EXPORT_PDF", enabled: false },
      { key: "AI_SUMMARY", enabled: false },
      { key: "BULK_VALIDATE", enabled: true, limit: 3 },
      { key: "API_ACCESS", enabled: false },
      { key: "TEAM_MEMBERS", enabled: true, limit: 1 },
      { key: "CUSTOM_HEADERS", enabled: false },
      { key: "WEBHOOKS", enabled: false },
      { key: "SCHEDULED_EXPORTS", enabled: false },
      { key: "NEW_DASHBOARD", enabled: true },
      { key: "ADVANCED_FILTERS", enabled: false },
      { key: "WHITELABEL", enabled: false },
      { key: "PRIORITY_SUPPORT", enabled: false },
    ],
    STARTER: [
      { key: "EXPORT_PDF", enabled: true },
      { key: "AI_SUMMARY", enabled: false },
      { key: "BULK_VALIDATE", enabled: true, limit: 5000 },
      { key: "API_ACCESS", enabled: true },
      { key: "TEAM_MEMBERS", enabled: true, limit: 3 },
      { key: "CUSTOM_HEADERS", enabled: false },
      { key: "WEBHOOKS", enabled: true },
      { key: "SCHEDULED_EXPORTS", enabled: false },
      { key: "NEW_DASHBOARD", enabled: true },
      { key: "ADVANCED_FILTERS", enabled: false },
      { key: "WHITELABEL", enabled: false },
      { key: "PRIORITY_SUPPORT", enabled: false },
    ],
    PRO: [
      { key: "EXPORT_PDF", enabled: true },
      { key: "AI_SUMMARY", enabled: true },
      { key: "BULK_VALIDATE", enabled: true, limit: 50000 },
      { key: "API_ACCESS", enabled: true },
      { key: "TEAM_MEMBERS", enabled: true, limit: 10 },
      { key: "CUSTOM_HEADERS", enabled: true },
      { key: "WEBHOOKS", enabled: true },
      { key: "SCHEDULED_EXPORTS", enabled: true },
      { key: "NEW_DASHBOARD", enabled: true },
      { key: "ADVANCED_FILTERS", enabled: true },
      { key: "WHITELABEL", enabled: false },
      { key: "PRIORITY_SUPPORT", enabled: false },
    ],
    BUSINESS: [
      { key: "EXPORT_PDF", enabled: true },
      { key: "AI_SUMMARY", enabled: true },
      { key: "BULK_VALIDATE", enabled: true, limit: null }, // unlimited
      { key: "API_ACCESS", enabled: true },
      { key: "TEAM_MEMBERS", enabled: true, limit: null }, // unlimited
      { key: "CUSTOM_HEADERS", enabled: true },
      { key: "WEBHOOKS", enabled: true },
      { key: "SCHEDULED_EXPORTS", enabled: true },
      { key: "NEW_DASHBOARD", enabled: true },
      { key: "ADVANCED_FILTERS", enabled: true },
      { key: "WHITELABEL", enabled: true },
      { key: "PRIORITY_SUPPORT", enabled: true },
    ],
  };

  console.log("Seeding plan-feature mappings...");
  let mappingCount = 0;
  for (const [planKey, featureMappings] of Object.entries(planFeatureMap)) {
    const plan = await prisma.pricingPlan.findUnique({ where: { key: planKey } });
    if (!plan) {
      console.warn(`  ⚠ Plan ${planKey} not found, skipping`);
      continue;
    }

    for (const fm of featureMappings) {
      const feature = await prisma.feature.findUnique({ where: { key: fm.key } });
      if (!feature) {
        console.warn(`  ⚠ Feature ${fm.key} not found, skipping`);
        continue;
      }

      await prisma.planFeature.upsert({
        where: { planId_featureId: { planId: plan.id, featureId: feature.id } },
        update: {
          enabled: fm.enabled,
          limitValue: fm.limit ?? null,
          downgradeStrategy: "IMMEDIATE",
        },
        create: {
          planId: plan.id,
          featureId: feature.id,
          enabled: fm.enabled,
          limitValue: fm.limit ?? null,
          downgradeStrategy: "IMMEDIATE",
        },
      });
      mappingCount++;
    }
  }
  console.log(`  ✓ ${mappingCount} plan-feature mappings seeded`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
