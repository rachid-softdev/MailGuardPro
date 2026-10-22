"use client";

import { AlertCircle, ArrowRight, Mail } from "lucide-react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button, Input } from "@/components/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading("magic");
    setError(null);
    try {
      const result = await signIn("resend", { email, callbackUrl: "/dashboard", redirect: false });
      if (result?.error) {
        setError(
          result.error === "OAuthSignin"
            ? "Could not send the magic link. Please try again."
            : result.error,
        );
      } else {
        setSent(true);
        setError(null);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading("");
    }
  };

  const handleGoogle = async () => {
    setLoading("google");
    setError(null);
    // OAuth providers must redirect; errors surface on the callback page
    await signIn("google", { callbackUrl: "/dashboard" });
  };

  return (
    <AuthShell
      eyebrow="Sign in / operator"
      title="Back to the line."
      description="Use a magic link or Google. No password to remember, no password to leak."
      footer={
        <p className="text-center text-xs leading-relaxed text-[var(--ink-3)]">
          New to MailGuard?{" "}
          <Link
            href="/pricing"
            className="font-medium text-[var(--ink)] underline decoration-[var(--line-strong)] underline-offset-2 hover:text-[var(--accent-text)]"
          >
            Compare plans
          </Link>{" "}
          or{" "}
          <Link
            href="/"
            className="font-medium text-[var(--ink)] underline decoration-[var(--line-strong)] underline-offset-2 hover:text-[var(--accent-text)]"
          >
            read the overview
          </Link>
          .
        </p>
      }
    >
      {error && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2 border border-[var(--status-invalid)] bg-[var(--status-invalid-bg)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--status-invalid-text)]"
        >
          <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {sent ? (
        <div>
          <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] pb-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-[var(--line)] bg-[var(--accent-soft)] text-[var(--accent-text)]">
                <Mail size={16} aria-hidden="true" />
              </span>
              <div>
                <p className="font-display text-sm font-semibold text-[var(--ink)]">
                  Check your inbox
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-2)]">
                  A magic link is on its way to
                </p>
                <p className="mt-1 break-all font-mono text-[11px] text-[var(--ink)]">{email}</p>
              </div>
            </div>
            <span className="stamp stamp-idle shrink-0">Sent</span>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-[var(--ink-3)]">
            The link expires in 10 minutes. Check spam if it does not arrive.
          </p>
          <Button
            type="button"
            variant="ghost"
            className="mt-4 w-full"
            onClick={() => {
              setSent(false);
              setError(null);
            }}
          >
            Use a different email
          </Button>
        </div>
      ) : (
        <>
          <Button
            onClick={handleGoogle}
            disabled={!!loading}
            variant="secondary"
            className="w-full"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </Button>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--line)]" />
            <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
              or use email
            </span>
            <div className="h-px flex-1 bg-[var(--line)]" />
          </div>

          <form onSubmit={handleMagicLink} noValidate>
            <label
              htmlFor="login-email"
              className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-2)]"
            >
              Email address
            </label>
            <Input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              required
              disabled={!!loading}
            />
            <Button
              type="submit"
              disabled={!!loading || !email}
              variant="accent"
              className="mt-3 w-full"
            >
              {loading === "magic" ? "Sending link…" : "Send magic link"}
              {loading !== "magic" && <ArrowRight size={14} aria-hidden="true" />}
            </Button>
          </form>

          <p className="mt-4 text-[10px] leading-relaxed text-[var(--ink-3)]">
            By continuing, you agree to the service terms.
          </p>
        </>
      )}
    </AuthShell>
  );
}
