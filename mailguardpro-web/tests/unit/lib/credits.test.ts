import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindUnique, mockUpdateMany, mockFindMany } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockUpdateMany: vi.fn(),
  mockFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
      findMany: mockFindMany,
      updateMany: mockUpdateMany,
    },
  },
}));

import {
  includedCreditsForPlan,
  nextMonthlyReset,
  resetCreditsForOrganization,
  resetCreditsIfDue,
  resetDueCredits,
} from "@/lib/credits";

describe("lib/credits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  describe("includedCreditsForPlan", () => {
    it("returns the plan allowance for metered plans", () => {
      expect(includedCreditsForPlan("FREE")).toBe(100);
      expect(includedCreditsForPlan("STARTER")).toBe(5000);
      expect(includedCreditsForPlan("PRO")).toBe(50000);
    });

    it("stores no balance for BUSINESS because the gate is bypassed", () => {
      expect(includedCreditsForPlan("BUSINESS")).toBe(0);
    });
  });

  describe("nextMonthlyReset", () => {
    it("keeps the time of day and clamps the day to the next month", () => {
      expect(nextMonthlyReset(new Date("2026-01-31T12:34:56.000Z")).toISOString()).toBe(
        "2026-02-28T12:34:56.000Z",
      );
      expect(nextMonthlyReset(new Date("2028-01-31T12:34:56.000Z")).toISOString()).toBe(
        "2028-02-29T12:34:56.000Z",
      );
    });
  });

  describe("resetCreditsIfDue", () => {
    const now = new Date("2026-10-26T03:00:00.000Z");

    it("does nothing for free or unknown plans", async () => {
      mockFindUnique.mockResolvedValue({ plan: "FREE", creditsResetAt: null });

      await expect(resetCreditsIfDue("user-1", now)).resolves.toBe(false);
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });

    it("does nothing before the refill timestamp", async () => {
      mockFindUnique.mockResolvedValue({
        plan: "PRO",
        creditsResetAt: new Date("2026-11-01T00:00:00.000Z"),
      });

      await expect(resetCreditsIfDue("user-1", now)).resolves.toBe(false);
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });

    it("refills a due allowance with a conditional update", async () => {
      mockFindUnique.mockResolvedValue({ plan: "STARTER", creditsResetAt: null });

      await expect(resetCreditsIfDue("user-1", now)).resolves.toBe(true);

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: {
          id: "user-1",
          plan: "STARTER",
          OR: [{ creditsResetAt: null }, { creditsResetAt: { lte: now } }],
        },
        data: {
          credits: 5000,
          creditsResetAt: nextMonthlyReset(now),
        },
      });
    });

    it("returns false when another refill wins the race", async () => {
      mockFindUnique.mockResolvedValue({ plan: "PRO", creditsResetAt: null });
      mockUpdateMany.mockResolvedValue({ count: 0 });

      await expect(resetCreditsIfDue("user-1", now)).resolves.toBe(false);
    });
  });

  describe("resetCreditsForOrganization", () => {
    const now = new Date("2026-10-26T03:00:00.000Z");

    it("ignores non-paid plans", async () => {
      await expect(resetCreditsForOrganization("org-1", "FREE", now)).resolves.toBe(0);
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });

    it("refills every due member of a paid organization", async () => {
      mockUpdateMany.mockResolvedValue({ count: 3 });

      await expect(resetCreditsForOrganization("org-1", "BUSINESS", now)).resolves.toBe(3);

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: {
          organizationId: "org-1",
          plan: "BUSINESS",
          OR: [{ creditsResetAt: null }, { creditsResetAt: { lte: now } }],
        },
        data: {
          credits: 0,
          creditsResetAt: nextMonthlyReset(now),
        },
      });
    });
  });

  describe("resetDueCredits", () => {
    it("scans due users and counts only successful refills", async () => {
      mockFindMany.mockResolvedValue([{ id: "user-1" }, { id: "user-2" }]);
      mockFindUnique
        .mockResolvedValueOnce({ plan: "STARTER", creditsResetAt: null })
        .mockResolvedValueOnce({ plan: "STARTER", creditsResetAt: null });
      mockUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

      await expect(resetDueCredits(new Date("2026-10-26T03:00:00.000Z"))).resolves.toEqual({
        scanned: 2,
        reset: 1,
      });
    });
  });
});
