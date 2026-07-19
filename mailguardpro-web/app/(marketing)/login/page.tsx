"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { Button, Card, Input } from "@/components/ui";

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
            ? "Could not send magic link. Please try again."
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
    // OAuth providers must redirect; errors surface on callback page
    await signIn("google", { callbackUrl: "/dashboard" });
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
            <h1 className="font-display text-2xl font-bold tracking-tight">Sign in</h1>
            <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
              Welcome back. Secure your inbox in seconds.
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

          {/* Google */}
          <Button onClick={handleGoogle} disabled={!!loading} variant="secondary" className="w-full">
            <svg className="h-5 w-5" viewBox="0 0 24 24">
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

          {/* Divider */}
          <div className="my-6 flex items-center gap-4">
            <div className="h-px flex-1 bg-[var(--border)]" />
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
              or
            </span>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>

          {/* Magic link */}
          {sent ? (
            <div className="text-center py-2">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-light)] text-[var(--accent)]">
                <svg
                  className="h-6 w-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="font-display text-lg font-semibold">Check your inbox</h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">We sent a magic link to</p>
              <p className="mt-1 text-sm font-mono text-[var(--text-primary)]">{email}</p>
              <button
                onClick={() => setSent(false)}
                className="mt-4 text-sm font-medium text-[var(--accent)] hover:underline"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleMagicLink}>
              <label className="mb-2 block text-sm font-medium">Email address</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mb-4"
                required
                disabled={sent}
              />
              <Button
                type="submit"
                disabled={!!loading || !email}
                variant="accent"
                className="w-full"
              >
                {loading === "magic" ? "Sending..." : "Send magic link"}
              </Button>
            </form>
          )}

          <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
            By continuing, you agree to our{" "}
            <Link
              href="/terms"
              className="font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Terms of Service
            </Link>
          </p>
        </Card>

        <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
          New to MailGuard Pro?{" "}
          <Link href="/" className="font-medium text-[var(--accent)] hover:underline">
            Learn more
          </Link>
        </p>
      </div>
    </div>
  );
}
