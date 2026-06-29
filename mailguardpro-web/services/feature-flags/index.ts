// ================================================================
// Feature Flags + Entitlements — Public API
// ================================================================

export type { ICacheService } from "./cacheService";
export { CacheService, getCacheService, LRUCache, resetCacheService } from "./cacheService";
export { DowngradeService } from "./downgradeService";
export type {
  FeatureRow,
  IEntitlementRepository,
  OrganizationRow,
  OverrideRow,
  PlanFeatureRow,
  PlanRow,
  SubscriptionRow,
  UsageRow,
} from "./entitlementRepository";
export { PrismaEntitlementRepository } from "./entitlementRepository";
export { FeatureGateService } from "./featureGateService";
export { createMiddlewareFactory } from "./middlewares";
export type { StripeWebhookResult } from "./stripeWebhookHandler";
export { createStripeWebhookHandler, StripeWebhookHandler } from "./stripeWebhookHandler";
export * from "./types";
