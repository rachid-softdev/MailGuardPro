import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock stripe — must be constructable with new Stripe()
class MockStripe {
  public customers: { create: ReturnType<typeof vi.fn> };
  public subscriptions: { create: ReturnType<typeof vi.fn> };
  public checkout: { sessions: { create: ReturnType<typeof vi.fn> } };
  constructor() {
    this.customers = { create: vi.fn() };
    this.subscriptions = { create: vi.fn() };
    this.checkout = { sessions: { create: vi.fn() } };
  }
}

vi.mock("stripe", () => ({
  __esModule: true,
  default: MockStripe,
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
      expect(getPlanFromPriceId(PRICES.STARTER!)).toBe("STARTER");
    });

    it("should return PRO for PRO price", async () => {
      const { getPlanFromPriceId, PRICES } = await import("@/lib/stripe");
      expect(getPlanFromPriceId(PRICES.PRO!)).toBe("PRO");
    });

    it("should return BUSINESS for BUSINESS price", async () => {
      const { getPlanFromPriceId, PRICES } = await import("@/lib/stripe");
      expect(getPlanFromPriceId(PRICES.BUSINESS!)).toBe("BUSINESS");
    });

    it("should return null for unknown price", async () => {
      const { getPlanFromPriceId } = await import("@/lib/stripe");
      expect(getPlanFromPriceId("unknown_price")).toBeNull();
    });
  });

  describe("default price IDs", () => {
    it("should throw if env vars not set", async () => {
      vi.resetModules();
      delete process.env.STRIPE_STARTER_PRICE_ID;
      delete process.env.STRIPE_PRO_PRICE_ID;
      delete process.env.STRIPE_BUSINESS_PRICE_ID;

      // Use vi.importActual to bypass the module mock and load the real module
      await expect(vi.importActual("@/lib/stripe")).rejects.toThrow("STRIPE_STARTER_PRICE_ID");
    });
  });

  describe("STRIPE_SECRET_KEY missing", () => {
    it("should throw STRIPE_SECRET_KEY is not defined when env var missing", async () => {
      vi.resetModules();
      vi.stubEnv("STRIPE_SECRET_KEY", "");
      vi.stubEnv("STRIPE_STARTER_PRICE_ID", "price_starter");
      vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_pro");
      vi.stubEnv("STRIPE_BUSINESS_PRICE_ID", "price_business");

      try {
        await vi.importActual("@/lib/stripe");
        // Should not reach here
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toBe("STRIPE_SECRET_KEY is not defined");
      }

      vi.unstubAllEnvs();
    });
  });

  describe("individual price IDs missing", () => {
    it("should throw when STARTER price ID is missing", async () => {
      vi.resetModules();
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
      vi.stubEnv("STRIPE_STARTER_PRICE_ID", "");
      vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_pro");
      vi.stubEnv("STRIPE_BUSINESS_PRICE_ID", "price_business");

      try {
        await vi.importActual("@/lib/stripe");
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toContain("STRIPE_STARTER_PRICE_ID");
      }

      vi.unstubAllEnvs();
    });

    it("should throw when PRO price ID is missing", async () => {
      vi.resetModules();
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
      vi.stubEnv("STRIPE_STARTER_PRICE_ID", "price_starter");
      vi.stubEnv("STRIPE_PRO_PRICE_ID", "");
      vi.stubEnv("STRIPE_BUSINESS_PRICE_ID", "price_business");

      try {
        await vi.importActual("@/lib/stripe");
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toContain("STRIPE_PRO_PRICE_ID");
      }

      vi.unstubAllEnvs();
    });

    it("should throw when BUSINESS price ID is missing", async () => {
      vi.resetModules();
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
      vi.stubEnv("STRIPE_STARTER_PRICE_ID", "price_starter");
      vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_pro");
      vi.stubEnv("STRIPE_BUSINESS_PRICE_ID", "");

      try {
        await vi.importActual("@/lib/stripe");
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toContain("STRIPE_BUSINESS_PRICE_ID");
      }

      vi.unstubAllEnvs();
    });
  });

  describe("getPlanFromPriceId edge cases", () => {
    it("should return null for empty string price ID", async () => {
      // Use vi.importActual to force a fresh module eval with properly set env vars
      vi.resetModules();
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
      vi.stubEnv("STRIPE_STARTER_PRICE_ID", "price_starter");
      vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_pro");
      vi.stubEnv("STRIPE_BUSINESS_PRICE_ID", "price_business");

      const mod = await import("@/lib/stripe");
      expect(mod.getPlanFromPriceId("")).toBeNull();

      vi.unstubAllEnvs();
    });

    it("should return null for undefined price ID", async () => {
      vi.resetModules();
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
      vi.stubEnv("STRIPE_STARTER_PRICE_ID", "price_starter");
      vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_pro");
      vi.stubEnv("STRIPE_BUSINESS_PRICE_ID", "price_business");

      const mod = await import("@/lib/stripe");
      // @ts-expect-error - testing undefined behaviour
      expect(mod.getPlanFromPriceId(undefined)).toBeNull();

      vi.unstubAllEnvs();
    });
  });
});
