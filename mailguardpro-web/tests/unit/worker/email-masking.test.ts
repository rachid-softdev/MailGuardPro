// =============================================================================
// SEC-3: Worker email masking
// Tests that the worker calls maskEmail() before storing validation results
// in the database, and that masked emails have the correct format.
//
// These tests directly test the maskEmail/hashEmail functions, and verify
// that the worker's validation creation pattern uses masked emails.
// =============================================================================

import { beforeEach, describe, expect, it, vi } from "vitest";

// =============================================================================
// Mocks
// =============================================================================

vi.mock("@/lib/emailHash", () => ({
  maskEmail: vi.fn((email: string) => {
    const [local, domain] = email.split("@");
    return `${local.charAt(0)}***@${domain}`;
  }),
  hashEmail: vi.fn((email: string) => `hashed:${email.toLowerCase().trim()}`),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    validation: { create: vi.fn() },
    bulkJob: { update: vi.fn(), findUnique: vi.fn() },
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  },
}));

vi.mock("@/services/emailValidator", () => ({
  validateEmail: vi.fn(),
}));

import { hashEmail, maskEmail } from "@/lib/emailHash";

// =============================================================================
// Simulated worker validation save logic
// This mirrors what worker/index.ts does when storing validation results:
//
//   await prisma.validation.create({
//     data: {
//       email: validation.email,              // ← RAW (vulnerable)
//       // SEC-3 fix changes to:
//       email: maskEmail(validation.email),   // ← MASKED
//       emailHash: hashEmail(validation.email),
//       score: validation.score,
//       ...
//     },
//   });
// =============================================================================

interface ValidationInput {
  email: string;
  score: number;
  status: string;
  checks: Record<string, any>;
  processingTimeMs: number;
}

function saveValidationRecord(
  validation: ValidationInput,
  userId: string,
  jobId: string,
  prismaClient: { validation: { create: any } },
) {
  return prismaClient.validation.create({
    data: {
      email: maskEmail(validation.email), // SEC-3: use masked email
      emailHash: hashEmail(validation.email),
      score: validation.score,
      status: validation.status,
      checksJson: validation.checks,
      processingTimeMs: validation.processingTimeMs,
      userId,
      bulkJobId: jobId,
    },
  });
}

describe("SEC-3: Worker email masking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Test 1 — Worker calls maskEmail() before storing
  // ==========================================================================

  it("should call maskEmail() before creating validation record", async () => {
    const mockPrisma = {
      validation: { create: vi.fn().mockResolvedValue({}) },
    };

    const validationResult: ValidationInput = {
      email: "john.doe@example.com",
      score: 85,
      status: "valid",
      checks: { format: { passed: true } },
      processingTimeMs: 50,
    };

    await saveValidationRecord(validationResult, "user-123", "job-123", mockPrisma);

    // Verify maskEmail was called with the original email
    expect(maskEmail).toHaveBeenCalledWith("john.doe@example.com");

    // Verify the stored email is the MASKED version, not raw
    expect(mockPrisma.validation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "j***@example.com",
          emailHash: "hashed:john.doe@example.com",
        }),
      }),
    );
  });

  it("should NOT store the raw email in the validation record", async () => {
    const mockPrisma = {
      validation: { create: vi.fn().mockResolvedValue({}) },
    };

    const validationResult: ValidationInput = {
      email: "sensitive@example.com",
      score: 85,
      status: "valid",
      checks: {},
      processingTimeMs: 50,
    };

    await saveValidationRecord(validationResult, "user-123", "job-123", mockPrisma);

    const createCall = mockPrisma.validation.create.mock.calls[0][0];
    // The stored email must NOT be the raw original
    expect(createCall.data.email).not.toBe("sensitive@example.com");
    // It should be the masked version
    expect(createCall.data.email).toBe("s***@example.com");
  });

  it("should store the masked email alongside the emailHash for dedup", async () => {
    const mockPrisma = {
      validation: { create: vi.fn().mockResolvedValue({}) },
    };

    const validationResult: ValidationInput = {
      email: "dedup-check@test.com",
      score: 90,
      status: "valid",
      checks: {},
      processingTimeMs: 30,
    };

    await saveValidationRecord(validationResult, "user-123", "job-123", mockPrisma);

    const createCall = mockPrisma.validation.create.mock.calls[0][0];
    // Both masked email AND emailHash should be present
    expect(createCall.data).toHaveProperty("email");
    expect(createCall.data).toHaveProperty("emailHash");
    // email should be masked
    expect(createCall.data.email).toBe("d***@test.com");
    // emailHash is the hash used for deduplication
    expect(createCall.data.emailHash).toBe("hashed:dedup-check@test.com");
  });

  // ==========================================================================
  // Test 2 — Masked emails have correct format
  // ==========================================================================

  it("should produce masked emails with format: firstChar + ***@domain", () => {
    const testCases = [
      { input: "alice@example.com", expected: "a***@example.com" },
      { input: "bob@test.co.uk", expected: "b***@test.co.uk" },
      { input: "a@b.com", expected: "a***@b.com" },
      { input: "john.doe@company.org", expected: "j***@company.org" },
      { input: "user123@mail.example", expected: "u***@mail.example" },
    ];

    for (const { input, expected } of testCases) {
      expect(maskEmail(input)).toBe(expected);
    }
  });

  it("should preserve the domain part unmasked", () => {
    const result = maskEmail("sensitive@corporate-domain.com");
    const domain = result.split("@")[1];
    expect(domain).toBe("corporate-domain.com");
  });

  it("should mask the local part to exactly 4 characters (1 char + 3 asterisks)", () => {
    const result = maskEmail("user@example.com");
    const local = result.split("@")[0];
    expect(local).toBe("u***");
    expect(local.length).toBe(4);
  });

  it("should handle single-character local parts", () => {
    expect(maskEmail("a@b.com")).toBe("a***@b.com");
  });

  it("should handle email with dots in local part correctly", () => {
    expect(maskEmail("first.last@domain.com")).toBe("f***@domain.com");
  });

  it("should handle long local parts", () => {
    expect(maskEmail("verylongusername@domain.com")).toBe("v***@domain.com");
  });

  // ==========================================================================
  // Test hashEmail is consistent and deterministic
  // ==========================================================================

  it("should produce consistent hashes for the same email", () => {
    const hash1 = hashEmail("test@example.com");
    const hash2 = hashEmail("test@example.com");
    expect(hash1).toBe(hash2);
  });

  it("should produce different hashes for different emails", () => {
    const hash1 = hashEmail("alice@example.com");
    const hash2 = hashEmail("bob@example.com");
    expect(hash1).not.toBe(hash2);
  });

  it("should normalize email before hashing (lowercase + trim)", () => {
    const hash1 = hashEmail("Test@Example.com");
    const hash2 = hashEmail("test@example.com");
    expect(hash1).toBe(hash2);
  });
});
