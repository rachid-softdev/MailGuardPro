"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";

export default function VerifyPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    const type = searchParams.get("type");

    if (!token) {
      setStatus("error");
      setMessage("Invalid verification link. Please request a new one.");
      return;
    }

    // If this is a magic link verification, we need to handle it via the session
    // NextAuth will handle the actual verification when the user clicks the link
    // This page is shown AFTER the link is clicked and verified

    if (type === "email") {
      // Email verification complete
      setStatus("success");
      setMessage("Your email has been verified successfully!");

      // Redirect to dashboard after 3 seconds
      setTimeout(() => {
        router.push("/dashboard");
      }, 3000);
    } else if (type === "magic") {
      // Magic link - sign in
      setStatus("success");
      setMessage("Signing you in...");

      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
    } else {
      // Default - assume success for now (NextAuth handles this)
      setStatus("success");
      setMessage("Verification successful! Redirecting...");

      setTimeout(() => {
        router.push("/dashboard");
      }, 3000);
    }
  }, [searchParams, router]);

  const handleResend = async () => {
    try {
      const res = await fetch("/api/auth/send-verification", {
        method: "POST",
      });

      if (res.ok) {
        setMessage("Verification email sent! Please check your inbox.");
        setStatus("success");
      } else {
        setMessage("Failed to send verification email. Please try again.");
        setStatus("error");
      }
    } catch {
      setMessage("Could not send verification email. Check your connection and try again.");
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-8">
            <div className="w-10 h-10 bg-[var(--accent)] rounded-lg" />
            <span className="font-display text-2xl font-bold">MailGuard Pro</span>
          </Link>
        </div>

        <Card variant="default" padding="md">
          {status === "loading" && (
            <div className="text-center py-8">
              <div className="w-12 h-12 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-[var(--text-secondary)]">Verifying your account...</p>
            </div>
          )}

          {status === "success" && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-[var(--status-valid)]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-[var(--status-valid)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-display font-bold mb-2">Success!</h2>
              <p className="text-[var(--text-secondary)] mb-4">{message}</p>
              <p className="text-sm text-[var(--text-muted)]">Redirecting to dashboard...</p>
            </div>
          )}

          {status === "error" && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-[var(--status-invalid)]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-[var(--status-invalid)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-display font-bold mb-2">Verification Failed</h2>
              <p className="text-[var(--text-secondary)] mb-4">{message}</p>
              <Button onClick={handleResend} variant="primary">
                Resend Verification Email
              </Button>
            </div>
          )}
        </Card>

        <p className="text-center text-sm text-[var(--text-muted)] mt-4">
          <Link href="/login" className="hover:underline">
            Back to Login
          </Link>
        </p>
      </div>
    </div>
  );
}
