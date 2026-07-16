import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockValidateEmail } = vi.hoisted(() => ({ mockValidateEmail: vi.fn() }));

vi.mock("@/services/emailValidator", () => ({
  validateEmail: mockValidateEmail,
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn() },
}));

import { findLeadEmail } from "@/services/leadFinder";

describe("leadFinder edge cases (P2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateEmail.mockResolvedValue({ status: "valid", score: 90 });
  });

  it("infers default patterns for a 3-part known email and returns a valid lead", async () => {
    const result = await findLeadEmail({
      firstName: "john",
      lastName: "doe",
      companyDomain: "d.com",
      knownEmail: "a.b.c@d.com",
    });
    expect(result).not.toBeNull();
    expect(result!.email).toBe("john.doe@d.com");
    expect(result!.isValid).toBe(true);
  });

  it("builds an email even when the domain has no TLD dot", async () => {
    const result = await findLeadEmail({
      firstName: "john",
      lastName: "doe",
      companyDomain: "localhost",
    });
    expect(result).not.toBeNull();
    expect(result!.email).toBe("john.doe@localhost");
  });
});
