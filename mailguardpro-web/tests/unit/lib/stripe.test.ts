import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock stripe
vi.mock("stripe", () => ({
  __esModule: true,
  default: vi.fn(() => ({
    customers: { create: vi.fn() },
    subscriptions: { create: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
  })),
}));

// Set env vars before importing
const originalEnv = { ...process.env };
beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
  process.env.STRIPE_STARTER_PRICE_ID = "price_starter";
  process.env.STRIPE_PRO_PRICE_ID = "price_pro";
  process.env.STRIPE_BUSINESS_PRICE_ID = "price_business";
});

afterEach(() => {
  process.env = originalEnv;
});

describe("stripe", () => {
  describe("stripe instance", () => {
    it("should be defined", async () => {
      const { stripe } = await import("@/lib/stripe");
      expect(stripe).toBeDefined();
    });
  });

  describe("PRICES", () => {
    it("should have STARTER price", async () => {
      const { PRICES } = await import("@/lib/stripe");
      expect(PRICES.STARTER).toBe("price_starter");
    });

    it("should have PRO price", async () => {
      const { PRICES } = await import("@/lib/stripe");
      expect(PRICES.PRO).toBe("price_pro");
    });

    it("should have BUSINESS price", async () => {
      const { PRICES } = await import("@/lib/stripe");
      expect(PRICES.BUSINESS).toBe("price_business");
    });
  });

  describe("getPlanFromPriceId", () => {
    it("should return STARTER for STARTER price", async () => {
      const { getPlanFromPriceId, PRICES } = await import("@/lib/stripe");
      expect(getPlanFromPriceId(PRICES.STARTER)).toBe("STARTER");
    });

    it("should return PRO for PRO price", async () => {
      const { getPlanFromPriceId, PRICES } = await import("@/lib/stripe");
      expect(getPlanFromPriceId(PRICES.PRO)).toBe("PRO");
    });

    it("should return BUSINESS for BUSINESS price", async () => {
      const { getPlanFromPriceId, PRICES } = await import("@/lib/stripe");
      expect(getPlanFromPriceId(PRICES.BUSINESS)).toBe("BUSINESS");
    });

    it("should return null for unknown price", async () => {
      const { getPlanFromPriceId } = await import("@/lib/stripe");
      expect(getPlanFromPriceId("unknown_price")).toBeNull();
    });
  });

  describe("default price IDs", () => {
    it("should use default if env vars not set", async () => {
      vi.resetModules();
      delete process.env.STRIPE_STARTER_PRICE_ID;
      delete process.env.STRIPE_PRO_PRICE_ID;
      delete process.env.STRIPE_BUSINESS_PRICE_ID;

      const { PRICES } = await import("@/lib/stripe");
      expect(PRICES.STARTER).toBe("price_starter_monthly");
      expect(PRICES.PRO).toBe("price_pro_monthly");
      expect(PRICES.BUSINESS).toBe("price_business_monthly");
    });
  });
});
