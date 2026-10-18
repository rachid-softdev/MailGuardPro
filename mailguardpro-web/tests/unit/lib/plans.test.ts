import { describe, expect, it } from "vitest";
import { PLAN_BULK_MAX_ROWS, PLAN_INCLUDED_CREDITS } from "@/lib/plans";

describe("lib/plans — plan entitlements (single source of truth)", () => {
  it("included validation credits per plan (BUSINESS = -1 unlimited)", () => {
    expect(PLAN_INCLUDED_CREDITS).toEqual({
      FREE: 100,
      STARTER: 5000,
      PRO: 50000,
      BUSINESS: -1,
    });
  });

  it("bulk row caps per plan (FREE = 0 → no bulk access)", () => {
    expect(PLAN_BULK_MAX_ROWS).toEqual({
      FREE: 0,
      STARTER: 10000,
      PRO: 100000,
      BUSINESS: 1000000,
    });
  });
});
