"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useState } from "react";
import { Button, Card, Input } from "@/components/ui";

export function TwoFactorChallengeForm() {
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/user/2fa/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recoveryMode ? { recoveryCode: trimmed } : { code: trimmed }),
      });

      if (res.ok) {
        // Full reload so every server component re-evaluates the verified session
        window.location.href = "/dashboard";
        return;
      }

      const data = await res.json().catch(() => null);
      if (res.status === 429) {
        setError("Too many attempts. Please wait a few minutes and try again.");
      } else if (res.status === 409 || data?.error === "No pending two-factor challenge") {
        setError("This verification window has expired. Please sign in again.");
      } else {
        setError("Invalid code. Please try again.");
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-73px)] px-4 py-10">
      <div className="w-full max-w-md">
        {/* Brand */}
        <Link href="/" className="flex items-center justify-center gap-2.5 mb-8">
          <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--text-inverted)] shadow-[0_4px_12px_var(--accent-glow)]">
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </span>
          <span className="font-display text-2xl font-bold tracking-tight">MailGuard Pro</span>
        </Link>

        <Card variant="default" padding="lg">
          <div className="text-center mb-7">
            <h1 className="font-display text-2xl font-bold tracking-tight">
              Two-factor verification
            </h1>
            <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
              {recoveryMode
                ? "Enter one of your saved recovery codes."
                : "Enter the 6-digit code from your authenticator app."}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-5 flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--status-invalid)] bg-[var(--status-invalid-bg)] px-4 py-3 text-sm text-[var(--status-invalid)]">
              <svg
                className="mt-0.5 h-4 w-4 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <label className="mb-2 block text-sm font-medium" htmlFor="two-factor-code">
              {recoveryMode ? "Recovery code" : "Authentication code"}
            </label>
            <Input
              id="two-factor-code"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={recoveryMode ? "XXXXX-XXXXX" : "123456"}
              inputMode={recoveryMode ? "text" : "numeric"}
              autoComplete={recoveryMode ? "off" : "one-time-code"}
              autoFocus
              className="mb-4 font-mono"
              maxLength={recoveryMode ? 12 : 6}
              required
            />
            <Button
              type="submit"
              disabled={loading || !value.trim()}
              variant="accent"
              className="w-full"
            >
              {loading ? "Verifying..." : "Verify"}
            </Button>
          </form>

          <div className="mt-6 flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => {
                setRecoveryMode(!recoveryMode);
                setValue("");
                setError(null);
              }}
              className="font-medium text-[var(--accent)] hover:underline"
            >
              {recoveryMode ? "Use authenticator code" : "Use a recovery code"}
            </button>
            <button
              type="button"
              onClick={() => void signOut({ callbackUrl: "/login" })}
              className="font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              Sign out
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
