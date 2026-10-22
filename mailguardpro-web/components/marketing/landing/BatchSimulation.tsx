"use client";

import { Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ScoreMeter } from "@/components/validator/ScoreGauge";
import { cn } from "@/lib/cn";

type DemoStatus = "valid" | "risky" | "invalid";

interface DemoRow {
  email: string;
  score: number;
  status: DemoStatus;
}

const rows: DemoRow[] = [
  { email: "mara@northwind.co", score: 94, status: "valid" },
  { email: "ops@northwind.co", score: 91, status: "valid" },
  { email: "hello@gmial.com", score: 28, status: "risky" },
  { email: "team@mailinator.com", score: 34, status: "risky" },
  { email: "dead@example.net", score: 8, status: "invalid" },
  { email: "lena@northwind.co", score: 88, status: "valid" },
  { email: "sales@northwind.co", score: 96, status: "valid" },
  { email: "temp@yopmail.com", score: 31, status: "risky" },
];

export function BatchSimulation() {
  const [step, setStep] = useState(rows.length);
  const [running, setRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function run() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setStep(0);
    setRunning(true);

    let next = 0;
    const tick = () => {
      next += 1;
      setStep(next);
      if (next < rows.length) {
        timerRef.current = setTimeout(tick, 360);
      } else {
        setRunning(false);
      }
    };

    timerRef.current = setTimeout(tick, 280);
  }

  const inspected = rows.slice(0, step);
  const counts = inspected.reduce(
    (acc, row) => {
      acc[row.status] += 1;
      return acc;
    },
    { valid: 0, risky: 0, invalid: 0 },
  );
  const progress = Math.round((step / rows.length) * 100);
  const complete = step === rows.length;

  return (
    <section
      className="border-b border-[var(--line)] py-16 lg:py-24"
      aria-labelledby="field-test-title"
    >
      <div className="mx-auto max-w-[1280px] px-5 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="label-mono flex items-center gap-2.5">
              <span className="text-[var(--accent-text)]">Field test</span>
              <span className="h-px w-5 bg-[var(--line-strong)]" aria-hidden="true" />
              Simulated batch
            </p>
            <h2
              id="field-test-title"
              className="mt-4 max-w-[15ch] font-display text-[clamp(2.2rem,4.3vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.035em]"
            >
              Watch the line run.
            </h2>
          </div>
          <p className="max-w-[40ch] font-mono text-[10px] uppercase leading-relaxed tracking-[0.05em] text-[var(--ink-3)] lg:text-right">
            Eight addresses, six checks each, one sorted manifest
          </p>
        </div>

        <div className="mt-8 border border-[var(--line-strong)] bg-[var(--surface)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2.5">
            <div className="flex items-center gap-3">
              <p className="font-mono text-[10px] text-[var(--ink)]">northwind-oct.csv</p>
              <span className="font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--ink-3)]">
                {rows.length} rows
              </span>
            </div>
            <span
              className={cn(
                "stamp",
                complete ? "stamp-pass" : running ? "stamp-warn" : "stamp-idle",
              )}
            >
              {complete ? "Complete" : running ? "Running" : "Ready"}
            </span>
          </div>

          <div className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={run}
                  disabled={running}
                  className="btn btn-primary btn-sm"
                >
                  {running ? (
                    <>
                      <span
                        className="h-1.5 w-1.5 animate-pulse-dot bg-[var(--accent)]"
                        aria-hidden="true"
                      />
                      Inspecting
                    </>
                  ) : complete ? (
                    <>
                      <RotateCcw size={12} aria-hidden="true" />
                      Run again
                    </>
                  ) : (
                    <>
                      <Play size={12} aria-hidden="true" />
                      Run sample
                    </>
                  )}
                </button>
                <p className="font-mono text-[10px] text-[var(--ink-3)]" aria-live="polite">
                  {step}/{rows.length} inspected
                </p>
              </div>
              <p className="font-mono text-[10px] text-[var(--ink-2)]">{progress}%</p>
            </div>

            <div className="mt-3 h-2 w-full bg-[var(--surface-3)]" aria-hidden="true">
              <div
                className="h-full bg-[var(--accent)] transition-[width] duration-300 ease-[var(--ease-out-quart)]"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="mt-4 border-y border-[var(--line)]">
              {rows.map((row, index) => {
                const done = index < step;
                return (
                  <div
                    key={row.email}
                    className={cn(
                      "grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-[var(--line)] py-2 last:border-b-0 sm:grid-cols-[1.4fr_1fr_auto_auto]",
                      done ? "opacity-100" : "opacity-55",
                    )}
                  >
                    <span className="truncate font-mono text-[11px] text-[var(--ink)]">
                      {row.email}
                    </span>
                    <span className="hidden sm:block">
                      {done ? (
                        <ScoreMeter score={row.score} />
                      ) : (
                        <span className="font-mono text-[10px] text-[var(--ink-3)]">—</span>
                      )}
                    </span>
                    <span className="text-right">
                      {done ? (
                        <StatusBadge status={row.status} showDot={false} />
                      ) : (
                        <span className="stamp stamp-idle">Pending</span>
                      )}
                    </span>
                    <span className="hidden w-[38px] text-right font-mono text-[9px] uppercase text-[var(--ink-3)] sm:block">
                      {done ? "6/6" : "0/6"}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[9px] uppercase tracking-[0.04em]">
                <span className="text-[var(--status-valid-text)]">{counts.valid} valid</span>
                <span className="text-[var(--status-risky-text)]">{counts.risky} risky</span>
                <span className="text-[var(--status-invalid-text)]">{counts.invalid} invalid</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="label-mono text-[8px]">Export</span>
                {["CSV", "JSON", "XLSX", "PDF"].map((format) => (
                  <span
                    key={format}
                    className={cn(
                      "border px-2 py-1 font-mono text-[9px] transition-colors",
                      complete
                        ? "border-[var(--line)] text-[var(--ink-2)]"
                        : "border-[var(--line)] text-[var(--ink-3)]",
                    )}
                  >
                    {format}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
