"use client";

import { ArrowRight, Check, Mail, Search, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ScoreGauge } from "@/components/validator/ScoreGauge";
import { useDebounce } from "@/hooks/useDebounce";
import { SCORE_BANDS } from "@/lib/score";

interface ValidationResult {
  email: string;
  score: number;
  status: "valid" | "invalid" | "risky" | "unknown";
  checks: Record<string, { passed: boolean; message: string; detail?: string }>;
  domain: {
    name: string;
    reputation: string;
  };
  suggestion?: string;
}

export default function ValidatePage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState("");
  // Debounce the email input by 300ms before auto-triggering validation
  const debouncedEmail = useDebounce(email, 300);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Shared validation logic (used by both form submit and debounce effect)
  const runValidation = useCallback(async (emailToValidate: string) => {
    if (!emailToValidate) return;

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch(
        `/api/v1/validate?email=${encodeURIComponent(emailToValidate)}`,
        { signal: controller.signal },
      );

      // Ignore abort errors
      if (response.status === 0) return;

      const data = await response.json();

      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.error || "Validation failed");
      }
    } catch (err) {
      // Ignore AbortError - this is expected when cancelling requests
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      setError("Could not reach the validation server. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-trigger validation when debounced email settles (300ms after user stops typing)
  useEffect(() => {
    if (debouncedEmail) {
      runValidation(debouncedEmail);
    }
  }, [debouncedEmail, runValidation]);

  // Cleanup on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      runValidation(email);
    },
    [email, runValidation],
  );

  const checks = result ? Object.entries(result.checks) : [];
  const passed = checks.filter(([, check]) => check.passed).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          eyebrow="Inspection / single address"
          title="Inspect an address."
          description="Send one address through eleven checks. You get a weighted score, the evidence behind it, and a status you can act on."
          actions={
            <Link href="/history" className="btn btn-ghost btn-sm">
              Open history
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
          }
          meta={
            <>
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                1 credit / address
              </span>
              <span className="h-3 w-px bg-[var(--line)]" aria-hidden="true" />
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                Eleven checks
              </span>
              <span className="h-3 w-px bg-[var(--line)]" aria-hidden="true" />
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                Score 0–100
              </span>
            </>
          }
        />

        <form
          onSubmit={handleSubmit}
          className="border border-[var(--line-strong)] bg-[var(--surface)]"
        >
          <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-4 py-2.5">
            <p className="label-mono flex items-center gap-2">
              <span className="h-1.5 w-1.5 bg-[var(--accent)]" aria-hidden="true" />
              Address input
            </p>
            <p className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
              {loading ? "Reading…" : "Live / 300 ms debounce"}
            </p>
          </div>

          <div className="p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Mail
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-3)]"
                  aria-hidden="true"
                />
                <input
                  type="email"
                  autoComplete="email"
                  aria-label="Email address to inspect"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter an email address..."
                  disabled={loading}
                  className="input h-12 w-full pl-9 font-mono text-[15px]"
                />
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="submit"
                  disabled={loading || !email}
                  variant="accent"
                  size="lg"
                  className="flex-1 sm:flex-initial"
                >
                  {loading ? "Analyzing..." : "Analyze"}
                </Button>
                {result && (
                  <Button
                    type="button"
                    onClick={() => {
                      setEmail("");
                      setResult(null);
                      setError("");
                      if (abortControllerRef.current) {
                        abortControllerRef.current.abort();
                      }
                    }}
                    variant="ghost"
                    size="lg"
                    className="flex-1 sm:flex-initial"
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[var(--line)] pt-3">
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                Syntax
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                Domain
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                MX
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                Disposable
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                Typo
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                Reputation
              </span>
              <span className="ml-auto font-mono text-[9px] text-[var(--ink-3)]">
                Lower score = higher bounce risk
              </span>
            </div>
          </div>
        </form>

        {error && (
          <div
            role="alert"
            className="mt-4 border border-[var(--status-invalid)] bg-[var(--status-invalid-bg)] px-4 py-3 text-[13px] leading-relaxed text-[var(--status-invalid-text)]"
          >
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !result && (
          <div className="mt-5 grid gap-px border border-[var(--line)] bg-[var(--line)] lg:grid-cols-[0.9fr_1.1fr]">
            <div className="bg-[var(--surface)] p-5">
              <div className="h-2.5 w-24 animate-skeleton" />
              <div className="mt-4 h-10 w-28 animate-skeleton" />
              <div className="mt-5 h-2.5 w-full animate-skeleton" />
              <div className="mt-2 flex justify-between">
                <div className="h-2 w-6 animate-skeleton" />
                <div className="h-2 w-6 animate-skeleton" />
                <div className="h-2 w-6 animate-skeleton" />
                <div className="h-2 w-6 animate-skeleton" />
              </div>
            </div>
            <div className="bg-[var(--surface)] p-5">
              <div className="h-2.5 w-20 animate-skeleton" />
              <div className="mt-4 space-y-0">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 border-t border-[var(--line)] py-3 first:border-t-0"
                  >
                    <div className="h-4 w-4 shrink-0 animate-skeleton" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2.5 w-1/3 animate-skeleton" />
                      <div className="h-2 w-1/2 animate-skeleton" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="mt-5 grid gap-px border border-[var(--line-strong)] bg-[var(--line)] lg:grid-cols-[0.95fr_1.05fr]">
            <section className="bg-[var(--surface)] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
                <p className="label-mono">Specimen result</p>
                <StatusBadge status={result.status} />
              </div>

              <p className="mt-4 break-all font-mono text-[11px] text-[var(--ink-3)]">
                {result.email}
              </p>

              <ScoreGauge score={result.score} className="mt-5" />

              <dl className="mt-6 grid grid-cols-2 gap-px border border-[var(--line)] bg-[var(--line)]">
                <div className="bg-[var(--surface)] px-3 py-2.5">
                  <dt className="label-mono text-[8px]">Domain</dt>
                  <dd className="mt-1 truncate font-mono text-[11px] text-[var(--ink)]">
                    {result.domain?.name || "—"}
                  </dd>
                </div>
                <div className="bg-[var(--surface)] px-3 py-2.5">
                  <dt className="label-mono text-[8px]">Reputation</dt>
                  <dd className="mt-1 font-mono text-[11px] capitalize text-[var(--ink)]">
                    {result.domain?.reputation || "unknown"}
                  </dd>
                </div>
              </dl>

              {result.suggestion && (
                <div className="mt-4 border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5">
                  <p className="label-mono text-[8px]">Did you mean</p>
                  <p className="mt-1 break-all font-mono text-[12px] text-[var(--accent-text)]">
                    {result.suggestion}
                  </p>
                </div>
              )}
            </section>

            <section className="bg-[var(--surface)] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
                <p className="label-mono">Checks / {checks.length}</p>
                <p className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                  {passed} passed
                </p>
              </div>

              <div className="mt-2">
                {checks.map(([key, check]) => (
                  <div
                    key={key}
                    className="flex items-start gap-3 border-b border-[var(--line)] py-3 last:border-b-0"
                  >
                    <span
                      className={
                        check.passed
                          ? "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border border-[var(--status-valid)] text-[var(--status-valid)]"
                          : "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border border-[var(--status-invalid)] text-[var(--status-invalid)]"
                      }
                      aria-label={check.passed ? "Passed" : "Failed"}
                    >
                      {check.passed ? <Check size={11} /> : <X size={11} />}
                    </span>
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                        {key.replace(/_/g, " ")}
                      </p>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--ink)]">
                        {check.message || (check.passed ? "Passed" : "Failed")}
                      </p>
                      {check.detail && (
                        <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--ink-3)]">
                          {check.detail}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* Empty state */}
        {!result && !loading && !error && (
          <div className="mt-5 border border-dashed border-[var(--line-strong)] bg-[var(--surface)] p-5 sm:p-7">
            <div className="grid gap-8 md:grid-cols-2 md:gap-10">
              <div>
                <span className="flex h-9 w-9 items-center justify-center border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-2)]">
                  <Search size={16} aria-hidden="true" />
                </span>
                <h2 className="mt-4 font-display text-xl font-semibold tracking-[-0.02em] text-[var(--ink)]">
                  No address on the belt.
                </h2>
                <p className="mt-2 max-w-[42ch] text-[13px] leading-relaxed text-[var(--ink-2)]">
                  Type an address above. The line checks syntax, MX and SMTP records, catch-all
                  domains, disposability, role addresses, DNS blocklists, SPF, DMARC, and common
                  typos, then returns one weighted score.
                </p>
                <Link href="/bulk" className="btn btn-ghost btn-sm mt-4">
                  Send a batch instead
                  <ArrowRight size={13} aria-hidden="true" />
                </Link>
              </div>

              <div className="border-t border-[var(--line)] pt-5 md:border-l md:border-t-0 md:pl-8 md:pt-0">
                <p className="label-mono">Score bands</p>
                <div className="mt-3 space-y-2.5">
                  {SCORE_BANDS.map((band) => (
                    <div key={band.short} className="flex items-center gap-3">
                      <span
                        className="h-1.5 w-8 shrink-0"
                        style={{ backgroundColor: band.color }}
                        aria-hidden="true"
                      />
                      <span className="w-16 font-mono text-[10px] uppercase tracking-[0.03em] text-[var(--ink-2)]">
                        {band.short}
                      </span>
                      <span className="font-mono text-[10px] text-[var(--ink-3)]">
                        {band.min}–{band.max}
                      </span>
                      <span className="ml-auto hidden text-[10px] text-[var(--ink-3)] sm:inline">
                        {band.label}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-[10px] leading-relaxed text-[var(--ink-3)]">
                  A score is always paired with status and evidence. Never gate a send on the number
                  alone.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
