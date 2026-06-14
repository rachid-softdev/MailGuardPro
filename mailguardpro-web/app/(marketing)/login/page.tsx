"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";

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
    <div className="flex items-center justify-center min-h-[calc(100vh-73px)] p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 bg-[var(--accent)] rounded-xl" />
            <span className="font-display text-2xl font-bold">MailGuard Pro</span>
          </Link>
        </div>

        {/* Card */}
        <div className="card">
          <h1 className="text-2xl font-display font-bold text-center mb-6">Sign in</h1>

          {/* Error Message */}
          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-[var(--status-invalid)]/10 border border-[var(--status-invalid)]/30 text-sm text-[var(--status-invalid)]">
              {error}
            </div>
          )}

          {/* Google */}
          <button onClick={handleGoogle} disabled={!!loading} className="btn btn-ghost w-full mb-6">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
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
          </button>

          {/* Divider */}
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-px bg-[var(--border)]" />
            <span className="text-xs text-[var(--text-muted)] uppercase tracking-widest">or</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          {/* Magic Link */}
          {sent ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-[var(--accent-light)] rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-6 h-6 text-[var(--accent)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h3 className="font-display font-semibold mb-2">Check your inbox</h3>
              <p className="text-sm text-[var(--text-secondary)] mb-1">
                A magic link has been sent to
              </p>
              <p className="text-sm font-mono text-[var(--text-primary)]">{email}</p>
              <p className="text-xs text-[var(--text-muted)] mt-4">
                Didn&apos;t receive it? Check your spam folder or{" "}
                <button
                  onClick={() => setSent(false)}
                  className="text-[var(--accent)] hover:underline font-medium"
                >
                  try a different email
                </button>
              </p>
            </div>
          ) : (
            <form onSubmit={handleMagicLink}>
              <label className="block text-sm font-medium mb-2">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="input mb-4"
                required
                disabled={sent}
              />
              <button
                type="submit"
                disabled={!!loading || !email}
                className="btn btn-primary w-full"
              >
                {loading === "magic" ? "Sending..." : "Send magic link"}
              </button>
            </form>
          )}

          <p className="mt-6 text-xs text-center text-[var(--text-muted)]">
            By continuing, you agree to our Terms of Service
          </p>
        </div>
      </div>
    </div>
  );
}
