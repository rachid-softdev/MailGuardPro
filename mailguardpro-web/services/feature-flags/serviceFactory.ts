// ================================================================
// FeatureGate Service Factory — Singleton wiring
// ================================================================

import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { getCacheService } from "./cacheService";
import { DowngradeService } from "./downgradeService";
import { PrismaEntitlementRepository } from "./entitlementRepository";
import { FeatureGateService } from "./featureGateService";

// Singleton instances
let gateService: FeatureGateService | null = null;
let downgradeService: DowngradeService | null = null;

export function getFeatureGateService(): FeatureGateService {
  if (!gateService) {
    const repo = new PrismaEntitlementRepository(prisma);
    const cache = getCacheService(redis as any);
    gateService = new FeatureGateService(repo, cache);
  }
  return gateService;
}

export function getDowngradeService(): DowngradeService {
  if (!downgradeService) {
    const repo = new PrismaEntitlementRepository(prisma);
    const cache = getCacheService(redis as any);
    downgradeService = new DowngradeService(repo, cache);
  }
  return downgradeService;
}

export function resetServices(): void {
  gateService = null;
  downgradeService = null;
}
