"use client";

import { AlertCircle, ArrowRight } from "lucide-react";
import { signOut } from "next-auth/react";
import { useState } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button, Input } from "@/components/ui";

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
        setError("Too many attempts. Wait a few minutes and try again.");
      } else if (res.status === 409 || data?.error === "No pending two-factor challenge") {
        setError("This verification window has expired. Sign in again.");
      } else {
        setError("Invalid code. Check the six digits and try again.");
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Second check / access"
      title="One more stamp."
      description={
        recoveryMode
          ? "Enter one of the recovery codes you saved when you enabled two-factor authentication."
          : "Enter the six-digit code from your authenticator app to finish signing in."
      }
      footer={
        <div className="flex items-center justify-between gap-4 font-mono text-[10px] uppercase tracking-[0.04em]">
          <button
            type="button"
            onClick={() => {
              setRecoveryMode(!recoveryMode);
              setValue("");
              setError(null);
            }}
            className="text-[var(--accent-text)] hover:underline"
          >
            {recoveryMode ? "Use authenticator code" : "Use a recovery code"}
          </button>
          <button
            type="button"
            onClick={() => void signOut({ callbackUrl: "/login" })}
            className="text-[var(--ink-3)] hover:text-[var(--ink)]"
          >
            Sign out
          </button>
        </div>
      }
    >
      <div className="mb-5 flex items-center justify-between border-b border-[var(--line)] pb-4">
        <div>
          <p className="label-mono">Method</p>
          <p className="mt-1 text-sm text-[var(--ink)]">
            {recoveryMode ? "Recovery code" : "Authenticator app"}
          </p>
        </div>
        <span className="stamp stamp-warn">Required</span>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2 border border-[var(--status-invalid)] bg-[var(--status-invalid-bg)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--status-invalid-text)]"
        >
          <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <label
          htmlFor="two-factor-code"
          className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-2)]"
        >
          {recoveryMode ? "Recovery code" : "Authentication code"}
        </label>
        <Input
          id="two-factor-code"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={recoveryMode ? "XXXXX-XXXXX" : "000000"}
          inputMode={recoveryMode ? "text" : "numeric"}
          autoComplete={recoveryMode ? "off" : "one-time-code"}
          autoFocus
          className="font-mono tracking-[0.18em]"
          maxLength={recoveryMode ? 12 : 6}
          required
        />
        <Button
          type="submit"
          disabled={loading || !value.trim()}
          variant="accent"
          className="mt-3 w-full"
        >
          {loading ? "Verifying…" : "Verify and continue"}
          {!loading && <ArrowRight size={14} aria-hidden="true" />}
        </Button>
      </form>

      <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--ink-3)]">
        Codes rotate every 30 seconds
      </p>
    </AuthShell>
  );
}
