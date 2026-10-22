"use client";

import { Check, Loader2, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui";

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
      setMessage("Invalid verification link. Request a new one.");
      return;
    }

    // NextAuth handles the actual verification when the link is clicked. This
    // page is shown after that hand-off, so the remaining work is a redirect.
    if (type === "email") {
      setStatus("success");
      setMessage("Your email is verified. The register is open.");
      setTimeout(() => router.push("/dashboard"), 3000);
    } else if (type === "magic") {
      setStatus("success");
      setMessage("Signing you in. Hold the line.");
      setTimeout(() => router.push("/dashboard"), 2000);
    } else {
      setStatus("success");
      setMessage("Verification complete. Redirecting to the dashboard.");
      setTimeout(() => router.push("/dashboard"), 3000);
    }
  }, [searchParams, router]);

  const handleResend = async () => {
    try {
      const res = await fetch("/api/auth/send-verification", { method: "POST" });
      if (res.ok) {
        setMessage("Verification email sent. Check your inbox.");
        setStatus("success");
      } else {
        setMessage("Could not send the verification email. Try again.");
        setStatus("error");
      }
    } catch {
      setMessage("Could not reach the server. Check your connection.");
      setStatus("error");
    }
  };

  const copy =
    status === "loading"
      ? {
          title: "Checking the stamp.",
          description: "One moment while we read the verification token.",
        }
      : status === "success"
        ? {
            title: "You're through.",
            description: "The link is valid. We're moving you to the control room.",
          }
        : {
            title: "That link did not verify.",
            description: "The token is missing or no longer valid. Request a fresh one.",
          };

  return (
    <AuthShell
      eyebrow="Verification / access"
      title={copy.title}
      description={copy.description}
      footer={
        <p className="text-center font-mono text-[10px] uppercase tracking-[0.04em] text-[var(--ink-3)]">
          <Link href="/login" className="hover:text-[var(--ink)]">
            Back to sign in
          </Link>
        </p>
      }
    >
      {status === "loading" && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" aria-hidden="true" />
          <p className="text-sm text-[var(--ink-2)]">Verifying your account…</p>
        </div>
      )}

      {status === "success" && (
        <div className="py-2">
          <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] pb-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)]">
                <Check size={16} aria-hidden="true" />
              </span>
              <div>
                <p className="font-display text-sm font-semibold text-[var(--ink)]">Verified</p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--ink-2)]">{message}</p>
              </div>
            </div>
            <span className="stamp stamp-idle shrink-0">OK</span>
          </div>
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.04em] text-[var(--ink-3)]">
            Redirecting to dashboard…
          </p>
          <Button href="/dashboard" variant="primary" className="mt-4 w-full">
            Open dashboard
          </Button>
        </div>
      )}

      {status === "error" && (
        <div>
          <p className="border border-[var(--status-invalid)] bg-[var(--status-invalid-bg)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--status-invalid-text)]">
            {message}
          </p>
          <Button onClick={handleResend} variant="primary" className="mt-4 w-full">
            <RotateCcw size={14} aria-hidden="true" />
            Resend verification email
          </Button>
          <Button href="/login" variant="ghost" className="mt-2 w-full">
            Back to sign in
          </Button>
        </div>
      )}
    </AuthShell>
  );
}
