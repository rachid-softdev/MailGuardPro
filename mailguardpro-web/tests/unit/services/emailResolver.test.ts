import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashEmail } from "@/lib/emailHash";

const { mockBulkJobFindMany, mockBulkJobFindUnique } = vi.hoisted(() => ({
  mockBulkJobFindMany: vi.fn(),
  mockBulkJobFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bulkJob: {
      findMany: mockBulkJobFindMany,
      findUnique: mockBulkJobFindUnique,
    },
  },
}));

import {
  buildEmailHashMap,
  getBulkJobEmailMap,
  getBulkJobEmailMaps,
} from "@/services/emailResolver";

describe("services/emailResolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildEmailHashMap", () => {
    it("maps strings and objects by normalized email hash", () => {
      const map = buildEmailHashMap([
        "Alice@Example.com ",
        { email: "bob@example.org" },
        { email: "not-an-email" },
        null,
        42,
      ]);

      expect(map.size).toBe(2);
      expect(map.get(hashEmail("alice@example.com"))).toBe("alice@example.com");
      expect(map.get(hashEmail("bob@example.org"))).toBe("bob@example.org");
    });

    it("returns an empty map for non-array input", () => {
      expect(buildEmailHashMap(null).size).toBe(0);
      expect(buildEmailHashMap({ email: "a@b.com" }).size).toBe(0);
    });
  });

  describe("getBulkJobEmailMap", () => {
    it("loads a single job outbox", async () => {
      mockBulkJobFindUnique.mockResolvedValue({
        emailsJson: [{ email: "alice@example.com" }],
      });

      const map = await getBulkJobEmailMap("job-1");

      expect(mockBulkJobFindUnique).toHaveBeenCalledWith({
        where: { id: "job-1" },
        select: { emailsJson: true },
      });
      expect(map.get(hashEmail("alice@example.com"))).toBe("alice@example.com");
    });

    it("returns an empty map when the job or outbox is gone", async () => {
      mockBulkJobFindUnique.mockResolvedValue(null);
      await expect(getBulkJobEmailMap("job-1")).resolves.toEqual(new Map());
    });
  });

  describe("getBulkJobEmailMaps", () => {
    it("scopes the lookup to the owning user", async () => {
      mockBulkJobFindMany.mockResolvedValue([
        { id: "job-1", emailsJson: ["alice@example.com"] },
        { id: "job-2", emailsJson: [] },
      ]);

      const maps = await getBulkJobEmailMaps(["job-1", "job-2"], "user-1");

      expect(mockBulkJobFindMany).toHaveBeenCalledWith({
        where: { id: { in: ["job-1", "job-2"] }, userId: "user-1" },
        select: { id: true, emailsJson: true },
      });
      expect(maps.get("job-1")?.get(hashEmail("alice@example.com"))).toBe("alice@example.com");
      expect(maps.get("job-2")?.size).toBe(0);
    });

    it("does not query when there are no jobs", async () => {
      await expect(getBulkJobEmailMaps([], "user-1")).resolves.toEqual(new Map());
      expect(mockBulkJobFindMany).not.toHaveBeenCalled();
    });
  });
});
