"use client";

import { Check, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ScoreCircle } from "@/components/validator/ScoreCircle";
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
      setError("An error occurred during validation");
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
    <div className="min-h-screen bg-[var(--bg-base)] p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-display font-bold mb-8">Validate Email</h1>

        {/* Input */}
        <form onSubmit={handleSubmit} className="mb-8">
          <div className="flex gap-4">
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter an email address..."
              disabled={loading}
              style={{ fontSize: "var(--text-base)" }}
              className="input flex-1 h-14 md:h-16"
            />
            <button type="submit" disabled={loading || !email} className="btn btn-accent btn-lg">
              {loading ? "Analyzing..." : "Analyze"}
            </button>
          </div>
        </form>

        {error && (
          <div className="card border-[var(--status-invalid)] bg-[var(--status-invalid-bg)] p-4 mb-8">
            <p className="text-[var(--status-invalid)]">{error}</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="card">
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
                      className="flex items-start gap-3 py-2 border-b border-[var(--border)] last:border-0"
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
          </div>
        )}

        {/* Empty state */}
        {!result && !loading && !error && (
          <div className="card text-center py-12">
            <p className="text-[var(--text-muted)]">
              Enter an email address above to get a quality score (0-100)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
