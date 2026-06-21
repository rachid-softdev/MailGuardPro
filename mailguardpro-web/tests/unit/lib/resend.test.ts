import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock resend — must be constructable with new Resend()
class MockResend {
  public emails: { send: ReturnType<typeof vi.fn> };
  constructor() {
    this.emails = { send: vi.fn() };
  }
}

vi.mock("resend", () => ({
  __esModule: true,
  Resend: MockResend,
}));

describe("resend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("resend instance", () => {
    it("should be defined", async () => {
      const { resend } = await import("@/lib/resend");
      expect(resend).toBeDefined();
    });
  });

  describe("sendEmail", () => {
    it("should send email successfully", async () => {
      const { sendEmail, resend: resendModule } = await import("@/lib/resend");
      vi.mocked(resendModule.emails.send).mockResolvedValue({ id: "email-123" } as any);

      const result = await sendEmail({
        to: "test@example.com",
        subject: "Test Subject",
        html: "<p>Test content</p>",
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: "email-123" });
    });

    it("should return error on failure", async () => {
      const { sendEmail, resend: resendModule } = await import("@/lib/resend");
      vi.mocked(resendModule.emails.send).mockRejectedValue(new Error("API error"));

      const result = await sendEmail({
        to: "test@example.com",
        subject: "Test Subject",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should use default from address", async () => {
      const { sendEmail, resend: resendModule } = await import("@/lib/resend");
      vi.mocked(resendModule.emails.send).mockResolvedValue({ id: "email-123" } as any);

      await sendEmail({
        to: "test@example.com",
        subject: "Test",
      });

      expect(resendModule.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({
          from: expect.any(String),
        }),
      );
    });

    it("should include text content when provided", async () => {
      const { sendEmail, resend: resendModule } = await import("@/lib/resend");
      vi.mocked(resendModule.emails.send).mockResolvedValue({ id: "email-123" } as any);

      await sendEmail({
        to: "test@example.com",
        subject: "Test",
        text: "Plain text content",
      });

      expect(resendModule.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "Plain text content",
        }),
      );
    });
  });

  describe("EMAIL_TEMPLATES", () => {
    it("should have welcome template", async () => {
      const { EMAIL_TEMPLATES } = await import("@/lib/resend");

      const welcome = EMAIL_TEMPLATES.welcome();
      expect(welcome.subject).toBe("Bienvenue sur MailGuard Pro");
      expect(welcome.html).toContain("MailGuard Pro");
    });

    it("should welcome template accept name", async () => {
      const { EMAIL_TEMPLATES } = await import("@/lib/resend");

      const welcome = EMAIL_TEMPLATES.welcome("John");
      expect(welcome.html).toContain("John");
    });

    it("should have bulkCompleted template", async () => {
      const { EMAIL_TEMPLATES } = await import("@/lib/resend");

      const bulk = EMAIL_TEMPLATES.bulkCompleted("test.csv", 100, 80);
      expect(bulk.subject).toContain("test.csv");
      expect(bulk.html).toContain("100");
      expect(bulk.html).toContain("80");
    });

    it("should calculate deliverability rate in bulk template", async () => {
      const { EMAIL_TEMPLATES } = await import("@/lib/resend");

      const bulk = EMAIL_TEMPLATES.bulkCompleted("test.csv", 100, 50);
      expect(bulk.html).toContain("50%");
    });

    // ────────────────────────────────────────────
    // Scenario (d): bulkCompleted avec total=0
    // ────────────────────────────────────────────
    it("should handle bulkCompleted with total=0 without throwing", async () => {
      const { EMAIL_TEMPLATES } = await import("@/lib/resend");

      // total=0 would cause division by zero -> NaN, but should not throw
      expect(() => {
        const bulk = EMAIL_TEMPLATES.bulkCompleted("empty.csv", 0, 0);
        expect(bulk.html).toContain("0");
      }).not.toThrow();
    });

    // ────────────────────────────────────────────
    // Scenario (e): welcome() sans nom ne contient pas "null"
    // ────────────────────────────────────────────
    it("welcome() without name should not contain 'null' in HTML", async () => {
      const { EMAIL_TEMPLATES } = await import("@/lib/resend");

      const welcome = EMAIL_TEMPLATES.welcome();
      expect(welcome.html).not.toContain("null");
    });

    it("welcome() with undefined should not contain 'null' in HTML", async () => {
      const { EMAIL_TEMPLATES } = await import("@/lib/resend");

      const welcome = EMAIL_TEMPLATES.welcome(undefined);
      expect(welcome.html).not.toContain("null");
    });
  });

  // ────────────────────────────────────────────
  // Scenario (a): RESEND_API_KEY missing en production → throw
  // Scenario (b): RESEND_API_KEY missing en dev → logger.warn
  // ────────────────────────────────────────────
  describe("RESEND_API_KEY validation", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("should throw in production when RESEND_API_KEY is missing", async () => {
      vi.resetModules();
      vi.stubEnv("RESEND_API_KEY", "");
      vi.stubEnv("NODE_ENV", "production");

      await expect(vi.importActual("@/lib/resend")).rejects.toThrow(
        "RESEND_API_KEY is required in production",
      );
    });

    it("should warn in development when RESEND_API_KEY is missing", async () => {
      vi.resetModules();
      vi.stubEnv("RESEND_API_KEY", "");
      vi.stubEnv("NODE_ENV", "development");

      // Import the logger module to spy on it
      const { logger: testLogger } = await import("@/lib/logger");
      const warnSpy = vi.spyOn(testLogger, "warn").mockImplementation(() => {});

      // Now import resend (it will trigger the warn at module level)
      await vi.importActual("@/lib/resend");

      expect(warnSpy).toHaveBeenCalledWith(
        "RESEND_API_KEY is not defined — email sending will fail",
      );

      warnSpy.mockRestore();
    });

    it("should NOT throw in development when RESEND_API_KEY is missing", async () => {
      vi.resetModules();
      vi.stubEnv("RESEND_API_KEY", "");
      vi.stubEnv("NODE_ENV", "development");

      // Should not throw
      await expect(vi.importActual("@/lib/resend")).resolves.toBeDefined();
    });
  });

  // ────────────────────────────────────────────
  // Scenario (c): sendEmail utilise EMAIL_FROM quand défini
  // ────────────────────────────────────────────
  describe("sendEmail with EMAIL_FROM", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("should use EMAIL_FROM when defined", async () => {
      vi.stubEnv("EMAIL_FROM", "custom@mailguard.pro");

      const { sendEmail, resend: resendModule } = await import("@/lib/resend");
      vi.mocked(resendModule.emails.send).mockResolvedValue({ id: "email-123" } as any);

      await sendEmail({
        to: "test@example.com",
        subject: "Test",
      });

      expect(resendModule.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "custom@mailguard.pro",
        }),
      );
    });

    it("should use default from address when EMAIL_FROM is not defined", async () => {
      vi.stubEnv("EMAIL_FROM", "");

      const { sendEmail, resend: resendModule } = await import("@/lib/resend");
      vi.mocked(resendModule.emails.send).mockResolvedValue({ id: "email-123" } as any);

      await sendEmail({
        to: "test@example.com",
        subject: "Test",
      });

      expect(resendModule.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "noreply@mailguard.pro",
        }),
      );
    });
  });
});
