"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ScoreGauge } from "@/components/validator/ScoreGauge";

type CheckState = "pass" | "fail" | "warn";

interface Check {
  label: string;
  detail: string;
  state: CheckState;
}

interface Inspection {
  email: string;
  score: number;
  status: "valid" | "invalid" | "risky" | "unknown";
  checks: Check[];
  recommendation: string;
  suggestion?: string;
}

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "tempmail.com",
  "yopmail.com",
]);

const TYPO_DOMAINS = new Set(["gmial.com", "gmai.com", "hotmial.com", "outlok.com"]);

function inspectAddress(rawEmail: string): Inspection {
  const email = rawEmail.trim().toLowerCase();
  const structurallyValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  const [local, domain] = email.split("@");
  const disposable = DISPOSABLE_DOMAINS.has(domain);
  const typo = TYPO_DOMAINS.has(domain);

  if (!structurallyValid) {
    return {
      email,
      score: 8,
      status: "invalid",
      checks: [
        { label: "Syntax", detail: "Malformed address", state: "fail" },
        { label: "Domain", detail: "Cannot resolve domain", state: "fail" },
        { label: "MX record", detail: "No mail exchanger", state: "fail" },
        { label: "Mailbox", detail: "Not checked", state: "fail" },
        { label: "Disposable", detail: "Not checked", state: "fail" },
        { label: "Typo", detail: "Not checked", state: "fail" },
      ],
      recommendation: "Correct the address format before importing it.",
    };
  }

  if (typo) {
    return {
      email,
      score: 28,
      status: "risky",
      checks: [
        { label: "Syntax", detail: "Structure is valid", state: "pass" },
        { label: "Domain", detail: "Domain resolves", state: "pass" },
        { label: "MX record", detail: "No mail exchanger", state: "fail" },
        { label: "Mailbox", detail: "Mailbox not confirmed", state: "warn" },
        { label: "Disposable", detail: "Not a known burner", state: "pass" },
        { label: "Typo", detail: "Close to a known domain", state: "fail" },
      ],
      recommendation: "Hold this address and confirm the intended domain with the owner.",
      suggestion: email.replace(domain, "gmail.com"),
    };
  }

  if (disposable) {
    return {
      email,
      score: 34,
      status: "risky",
      checks: [
        { label: "Syntax", detail: "Structure is valid", state: "pass" },
        { label: "Domain", detail: "Domain resolves", state: "pass" },
        { label: "MX record", detail: "Mail exchanger found", state: "pass" },
        { label: "Mailbox", detail: "Mailbox responds", state: "pass" },
        { label: "Disposable", detail: "Known temporary domain", state: "fail" },
        { label: "Typo", detail: "No close match", state: "pass" },
      ],
      recommendation: "Quarantine this address. Temporary inboxes rarely convert.",
    };
  }

  return {
    email,
    score: 94,
    status: "valid",
    checks: [
      { label: "Syntax", detail: "Structure is valid", state: "pass" },
      { label: "Domain", detail: "Domain resolves", state: "pass" },
      { label: "MX record", detail: "Mail exchanger found", state: "pass" },
      { label: "Mailbox", detail: "Mailbox responds", state: "pass" },
      { label: "Disposable", detail: "Not a known burner", state: "pass" },
      { label: "Typo", detail: "No close match", state: "pass" },
    ],
    recommendation: `Clear to send. Keep ${local ? "this address" : "it"} in the main list.`,
  };
}

const presets = [
  { label: "Good address", email: "mara@northwind.co" },
  { label: "Disposable", email: "team@mailinator.com" },
  { label: "Typo", email: "hello@gmial.com" },
] as const;

const stateStamp: Record<CheckState, { label: string; className: string }> = {
  pass: { label: "PASS", className: "stamp-pass" },
  fail: { label: "FAIL", className: "stamp-fail" },
  warn: { label: "WARN", className: "stamp-warn" },
};

function Barcode() {
  const widths = [1, 2, 1, 3, 1, 1, 2, 1, 4, 1, 2, 1, 1, 3, 2, 1, 2, 1, 3, 1, 1, 2];
  return (
    <span className="flex h-5 items-stretch gap-[2px]" aria-hidden="true">
      {widths.map((width, index) => (
        <span
          key={`${width}-${index}`}
          className="block bg-[var(--ink)]"
          style={{ width, opacity: index % 3 === 0 ? 0.72 : 1 }}
        />
      ))}
    </span>
  );
}

export function InspectionSheet() {
  const inputId = useId();
  const defaultEmail = "mara@northwind.co";
  const [email, setEmail] = useState(defaultEmail);
  const [result, setResult] = useState<Inspection>(() => inspectAddress(defaultEmail));
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function runInspection(nextEmail: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    setLoading(true);
    timerRef.current = setTimeout(() => {
      setResult(inspectAddress(nextEmail));
      setLoading(false);
    }, 620);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runInspection(email);
  }

  function handlePreset(nextEmail: string) {
    setEmail(nextEmail);
    runInspection(nextEmail);
  }

  return (
    <section
      id="inspect"
      aria-labelledby="inspection-sheet-title"
      className="relative border border-[var(--line-strong)] bg-[var(--surface)] scroll-mt-24"
    >
      <div className="absolute right-0 top-0 h-8 w-8 border-b border-l border-[var(--line-strong)] bg-[var(--accent)]" />

      <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-4 py-2.5 pr-12">
        <h2 id="inspection-sheet-title" className="label-mono text-[var(--ink-2)]">
          Inspection sheet
        </h2>
        <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          No. 0042 / sample
        </p>
      </div>

      <div className="p-4 sm:p-5">
        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor={inputId} className="label-mono mb-2 block">
            Address
          </label>
          <div className="flex gap-2">
            <input
              id={inputId}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="input min-w-0 flex-1"
              placeholder="name@company.com"
              autoComplete="email"
              spellCheck={false}
            />
            <button type="submit" className="btn btn-primary btn-md shrink-0" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Inspecting
                </>
              ) : (
                "Inspect"
              )}
            </button>
          </div>
        </form>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Try
          </span>
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => handlePreset(preset.email)}
              className="font-mono text-[10px] text-[var(--ink-2)] underline decoration-[var(--line-strong)] underline-offset-2 transition-colors hover:text-[var(--accent-text)]"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div
          className="mt-5 border-t border-[var(--line)] pt-5"
          aria-live="polite"
          aria-busy={loading}
        >
          <div className={loading ? "opacity-35 transition-opacity" : "transition-opacity"}>
            <ScoreGauge
              score={result.score}
              label="Verdict"
              showScale
              showBand
              animate={!loading}
            />

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
              <StatusBadge status={result.status} showDot={false} />
              <p
                className="truncate font-mono text-[10px] text-[var(--ink-3)]"
                title={result.email}
              >
                {result.email}
              </p>
            </div>

            <div className="mt-4 border-y border-[var(--line)]">
              {result.checks.map((check) => {
                const stamp = stateStamp[check.state];
                return (
                  <div
                    key={check.label}
                    className="flex items-center justify-between gap-4 border-b border-[var(--line)] py-1.5 last:border-b-0"
                  >
                    <div className="flex min-w-0 items-baseline gap-2">
                      <span className="w-[72px] shrink-0 font-mono text-[10px] uppercase tracking-[0.04em] text-[var(--ink-2)]">
                        {check.label}
                      </span>
                      <span className="truncate text-[11px] text-[var(--ink-3)]">
                        {check.detail}
                      </span>
                    </div>
                    <span className={`stamp shrink-0 ${stamp.className}`}>{stamp.label}</span>
                  </div>
                );
              })}
            </div>

            <p className="mt-3 text-xs leading-relaxed text-[var(--ink-2)]">
              {result.recommendation}
              {result.suggestion && (
                <>
                  {" "}
                  Did you mean{" "}
                  <span className="font-mono text-[var(--accent-text)]">{result.suggestion}</span>?
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-[var(--line)] px-4 py-2.5">
        <p className="font-mono text-[9px] uppercase leading-relaxed tracking-[0.06em] text-[var(--ink-3)]">
          Sample logic
          <span className="hidden sm:inline"> · sign in for a live lookup</span>
        </p>
        <Barcode />
      </div>
    </section>
  );
}
