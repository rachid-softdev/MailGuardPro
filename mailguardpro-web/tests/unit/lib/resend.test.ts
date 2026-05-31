import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock resend
vi.mock("resend", () => ({
  __esModule: true,
  Resend: vi.fn(() => ({
    emails: {
      send: vi.fn(),
    },
  })),
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
  });
});
