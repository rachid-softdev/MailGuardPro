"use client";

import { Loader2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ScoreCircle } from "@/components/validator/ScoreCircle";
import { useDebounce } from "@/hooks/useDebounce";

interface ValidationResult {
  email: string;
  score: number;
  status: "valid" | "invalid" | "risky" | "unknown";
  suggestion?: string;
}

export function QuickValidate() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const debouncedEmail = useDebounce(email, 400);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const runValidation = useCallback(async (emailToValidate: string) => {
    if (!emailToValidate) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);

    try {
      const res = await fetch(`/api/v1/validate?email=${encodeURIComponent(emailToValidate)}`, {
        signal: controller.signal,
      });
      if (res.status === 0) return;
      const data = await res.json();
      if (data.success) {
        setResult(data.data);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debouncedEmail) {
      runValidation(debouncedEmail);
    }
  }, [debouncedEmail, runValidation]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const handleClear = useCallback(() => {
    setEmail("");
    setResult(null);
    abortRef.current?.abort();
    inputRef.current?.focus();
  }, []);

  return (
    <div className="card">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex-1 w-full">
          <div className="relative">
            <input
              ref={inputRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Paste an email to validate instantly..."
              className="input h-12 pl-4 pr-10 text-base"
              autoComplete="email"
              aria-label="Quick validate email"
            />
            {email && (
              <button
                onClick={handleClear}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                aria-label="Clear input"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <Loader2 className="w-4 h-4 animate-spin" />
              Checking...
            </div>
          )}

          {result && !loading && (
            <div className="flex items-center gap-3">
              <ScoreCircle score={result.score} size="sm" />
              <StatusBadge status={result.status} />
            </div>
          )}

          <Link href="/validate" className="btn btn-ghost btn-sm whitespace-nowrap">
            Full details
          </Link>
        </div>
      </div>

      {/* Suggestion */}
      {result?.suggestion && !loading && (
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Did you mean: <span className="text-[var(--accent)] font-mono">{result.suggestion}</span>?
        </p>
      )}
    </div>
  );
}
