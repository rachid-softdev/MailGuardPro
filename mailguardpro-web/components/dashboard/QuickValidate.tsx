"use client";

import { Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ScoreMeter } from "@/components/validator/ScoreGauge";
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
      if (abortRef.current === controller) {
        setLoading(false);
      }
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
    <div className="border border-[var(--line-strong)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-3.5 py-2">
        <p className="label-mono text-[var(--ink-2)]">Quick inspect</p>
        <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--ink-3)]">
          Live lookup / 1 credit
        </p>
      </div>

      <div className="p-3.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <span
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-[var(--ink-3)]"
              aria-hidden="true"
            >
              @
            </span>
            <input
              ref={inputRef}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Paste an address to inspect…"
              className="input pl-7 pr-9"
              autoComplete="email"
              aria-label="Quick validate email"
            />
            {email && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
                aria-label="Clear input"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div
            className="flex min-h-[32px] shrink-0 items-center gap-3 border-[var(--line)] sm:border-l sm:pl-3"
            aria-live="polite"
          >
            {loading && (
              <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.04em] text-[var(--ink-3)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Inspecting
              </span>
            )}

            {!loading && result && (
              <>
                <ScoreMeter score={result.score} />
                <StatusBadge status={result.status} showDot={false} />
              </>
            )}

            {!loading && !result && (
              <span className="font-mono text-[10px] uppercase tracking-[0.04em] text-[var(--ink-3)]">
                Awaiting input
              </span>
            )}
          </div>
        </div>

        {result?.suggestion && !loading && (
          <p className="mt-2.5 border-t border-[var(--line)] pt-2.5 text-[11px] text-[var(--ink-2)]">
            Did you mean{" "}
            <span className="font-mono text-[var(--accent-text)]">{result.suggestion}</span>?
          </p>
        )}
      </div>
    </div>
  );
}
