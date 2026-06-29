// ================================================================
// Feature Flags + Entitlements — Domain Types & Interfaces
// ================================================================

export type FeatureType = "boolean" | "limit" | "experiment";

export type DowngradeStrategy = "graceful" | "immediate" | "freeze";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired";

export type OverrideScope = "org" | "user";

export type ResolvedVia = "user_override" | "org_override" | "plan" | "fallback";

// ========== Feature Configuration ==========

export interface ExperimentConfig {
  percentage: number; // 0-100
  seed: string;
}

export interface FeatureDefaultConfig {
  percentage?: number;
  seed?: string;
}

// ========== Entitlement Types ==========

export interface PlanFeatureOverride {
  enabled: boolean | null; // null = use plan default
  limit_value: number | null; // null = unlimited or use plan default
  config_json?: Record<string, unknown>;
}

export interface EntitlementValue {
  enabled: boolean;
  limit: number | null; // null = unlimited (Enterprise)
  config: Record<string, unknown> | null;
}

export interface EntitlementMap {
  plan: string;
  features: Record<string, boolean>;
  limits: Record<string, number | null>;
  configs: Record<string, Record<string, unknown> | null>;
  usage: Record<string, number>;
  reset_at: Record<string, string | null>;
}

// ========== Debug ==========

export interface DebugTrace {
  featureKey: string;
  resolvedVia: ResolvedVia;
  enabled: boolean;
  limit: number | null;
  overrideId?: string;
  expiresAt?: string | null;
  planKey?: string;
  planEnabled?: boolean;
  planLimit?: number | null;
  orgOverrides?: Array<{
    id: string;
    enabled: boolean | null;
    limit_value: number | null;
    expires_at: string | null;
  }>;
  userOverrides?: Array<{
    id: string;
    enabled: boolean | null;
    limit_value: number | null;
    expires_at: string | null;
  }>;
}

// ========== Consume Result ==========

export interface ConsumeResultSuccess {
  success: true;
  remaining: number;
  limit: number;
  usage: number;
  reset_at: string;
}

export interface ConsumeResultFailure {
  success: false;
  error: "LIMIT_REACHED";
  feature: string;
  limit: number;
  used: number;
  reset_at: string;
  upgrade_url: string;
}

export type ConsumeResult = ConsumeResultSuccess | ConsumeResultFailure;

// ========== Downgrade ==========

export interface DowngradePreviewItem {
  featureKey: string;
  featureDescription: string;
  currentlyEnabled: boolean;
  willBeEnabled: boolean;
  currentLimit: number | null;
  newLimit: number | null;
  impact: "none" | "reduced" | "removed";
  strategy: DowngradeStrategy;
}

export interface DowngradePreview {
  fromPlan: string;
  toPlan: string;
  strategy: DowngradeStrategy;
  affectedFeatures: DowngradePreviewItem[];
}

// ========== Admin ==========

export interface PlanWithFeatures {
  id: string;
  key: string;
  name: string;
  price_monthly: number;
  is_active: boolean;
  features: Array<{
    feature: {
      id: string;
      key: string;
      description: string;
      type: FeatureType;
    };
    enabled: boolean;
    limit_value: number | null;
    config_json: Record<string, unknown> | null;
  }>;
}

export interface OverrideCreateInput {
  scope: OverrideScope;
  scope_id: string;
  feature_key: string;
  enabled?: boolean | null;
  limit_value?: number | null;
  expires_at?: string | null;
  reason: string; // mandatory in admin
}

export interface PaginationParams {
  page: number;
  limit: number;
  sort?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ========== Errors ==========

export class FeatureNotAvailableError extends Error {
  public readonly feature: string;
  public readonly planRequired: string;
  public readonly currentPlan: string;
  public readonly upgradeUrl: string;
  public readonly statusCode = 403;

  constructor(feature: string, planRequired: string, currentPlan: string) {
    super(`Feature "${feature}" is not available on plan "${currentPlan}"`);
    this.name = "FeatureNotAvailableError";
    this.feature = feature;
    this.planRequired = planRequired;
    this.currentPlan = currentPlan;
    this.upgradeUrl = "/billing/upgrade";
  }

  toJSON() {
    return {
      error: "FEATURE_NOT_AVAILABLE",
      feature: this.feature,
      plan_required: this.planRequired,
      current_plan: this.currentPlan,
      upgrade_url: this.upgradeUrl,
    };
  }
}

export class LimitReachedError extends Error {
  public readonly feature: string;
  public readonly limit: number;
  public readonly used: number;
  public readonly resetAt: string;
  public readonly statusCode = 402;

  constructor(feature: string, limit: number, used: number, resetAt: string) {
    super(`Limit reached for "${feature}": ${used}/${limit}`);
    this.name = "LimitReachedError";
    this.feature = feature;
    this.limit = limit;
    this.used = used;
    this.resetAt = resetAt;
  }

  toJSON() {
    return {
      error: "LIMIT_REACHED",
      feature: this.feature,
      limit: this.limit,
      used: this.used,
      reset_at: this.resetAt,
      upgrade_url: "/billing/upgrade",
    };
  }
}

export class SubscriptionExpiredError extends Error {
  public readonly statusCode = 402;

  constructor() {
    super("Subscription has expired");
    this.name = "SubscriptionExpiredError";
  }

  toJSON() {
    return {
      error: "SUBSCRIPTION_EXPIRED",
      renew_url: "/billing",
    };
  }
}

// ========== Experiment (A/B Testing) ==========

// Stable hashing for A/B experiments — same user always gets the same bucket
export function hashExperimentBucket(seed: string, userId: string): number {
  // Simple but stable hash: DJB2-like
  const str = `${seed}:${userId}`;
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash) % 100;
}
