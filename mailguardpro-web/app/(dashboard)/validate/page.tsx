"use client";

import { Check, Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ScoreCircle } from "@/components/validator/ScoreCircle";
import { Button, Card } from "@/components/ui";
import { useDebounce } from "@/hooks/useDebounce";

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

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-display font-bold mb-8">Validate Email</h1>

        {/* Input */}
        <form onSubmit={handleSubmit} className="mb-8">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="flex-1">
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter an email address..."
                disabled={loading}
                style={{ fontSize: "var(--text-base)" }}
                className="input w-full h-14 md:h-16 focus:shadow-[inset_0_1px_3px_rgba(0,0,0,0.06)]"
              />
              <div className="mt-1.5 flex items-start gap-1.5 text-xs text-[var(--text-muted)]">
                <svg
                  className="w-3.5 h-3.5 mt-0.5 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>
                  Score <strong>0–100</strong>: lower = higher bounce risk. Hover the score circle
                  for range details. Type and results update in real time.
                </span>
              </div>
            </div>
            <div className="flex gap-2 sm:gap-3 shrink-0">
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
        </form>

        {error && (
          <Card
            variant="default"
            padding="sm"
            className="animate-fade-slide-in border-[var(--status-invalid)] bg-[var(--status-invalid-bg)] mb-8"
          >
            <p className="text-[var(--status-invalid)]">{error}</p>
          </Card>
        )}

        {/* Loading skeleton */}
        {loading && !result && (
          <Card variant="default" padding="md">
            <div className="flex flex-col lg:flex-row gap-8">
              {/* Left: Score skeleton */}
              <div className="flex flex-col items-center justify-center lg:w-1/3">
                <div className="w-48 h-48 rounded-full animate-skeleton" />
                <div className="mt-4 w-20 h-6 rounded animate-skeleton" />
              </div>
              {/* Right: Checks skeleton (3 rows) */}
              <div className="flex-1">
                <div className="h-6 w-40 rounded animate-skeleton mb-4" />
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 py-3 border-b border-[var(--border)]"
                    >
                      <div className="w-10 h-10 rounded-full shrink-0 animate-skeleton" />
                      <div className="flex-1 space-y-2 py-1">
                        <div className="h-4 w-3/4 rounded animate-skeleton" />
                        <div className="h-3 w-1/2 rounded animate-skeleton" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Results */}
        {result && (
          <Card variant="default" padding="md">
            <div className="flex flex-col lg:flex-row gap-8">
              {/* Left: Score */}
              <div className="flex flex-col items-center justify-center lg:w-1/3">
                <ScoreCircle score={result.score} size="xl" />
                <div className="mt-4">
                  <StatusBadge status={result.status} />
                </div>
                {result.suggestion && (
                  <div className="mt-4 text-center">
                    <p className="text-sm text-[var(--text-muted)]">
                      Did you mean:{" "}
                      <span className="text-[var(--accent)] font-mono">{result.suggestion}</span>?
                    </p>
                  </div>
                )}
              </div>

              {/* Right: Checks */}
              <div className="flex-1">
                <h2 className="text-lg font-display font-semibold mb-4">Validation Details</h2>
                <div className="space-y-3">
                  {Object.entries(result.checks).map(([key, check]) => (
                    <div
                      key={key}
                      className="flex items-start gap-3 py-2 px-3 -mx-3 rounded-[var(--radius-md)] border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-elevated)] transition-colors"
                    >
                      <span
                        className={
                          check.passed
                            ? "text-[var(--status-valid)]"
                            : "text-[var(--status-invalid)]"
                        }
                      >
                        {check.passed ? <Check size={20} /> : <X size={20} />}
                      </span>
                      <div>
                        <p className="font-mono text-sm capitalize">{key}</p>
                        {check.detail && (
                          <p className="text-xs text-[var(--text-muted)]">{check.detail}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Empty state */}
        {!result && !loading && !error && (
          <Card variant="default" padding="md" className="text-center py-12">
            <div className="flex flex-col items-center gap-4">
              <Search
                size={48}
                className="text-[var(--text-muted)] opacity-40 animate-float-subtle"
              />
              <p className="text-[var(--text-muted)]">
                Enter an email address above to get a quality score (0–100)
              </p>
              <div className="flex flex-wrap justify-center gap-3 text-xs text-[var(--text-muted)]">
                <span className="inline-flex items-center gap-1">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: "var(--score-excellent)" }}
                  />
                  76–100 Excellent
                </span>
                <span className="inline-flex items-center gap-1">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: "var(--score-good)" }}
                  />
                  61–75 Good
                </span>
                <span className="inline-flex items-center gap-1">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: "var(--score-medium)" }}
                  />
                  41–60 Medium
                </span>
                <span className="inline-flex items-center gap-1">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: "var(--score-poor)" }}
                  />
                  26–40 Poor
                </span>
                <span className="inline-flex items-center gap-1">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: "var(--score-critical)" }}
                  />
                  0–25 Critical
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] max-w-md">
                Each email is checked against mail servers, domain reputation, format rules, and
                disposable inbox databases to produce a single quality score.
              </p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
