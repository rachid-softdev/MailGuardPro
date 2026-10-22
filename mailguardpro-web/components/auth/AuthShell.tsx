import type { ReactNode } from "react";
import { SCORE_BANDS } from "@/lib/score";

interface AuthShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Two-panel access screen: a specimen verdict on the left, the form on paper
 * to the right. On mobile the specimen steps aside and the form takes the full
 * width under the marketing header.
 */
export function AuthShell({ eyebrow, title, description, children, footer }: AuthShellProps) {
  return (
    <div className="min-h-[calc(100vh-4rem)] border-b border-[var(--line)]">
      <div className="mx-auto grid max-w-[1280px] lg:grid-cols-[0.92fr_1.08fr]">
        <aside className="hidden border-r border-[var(--line)] bg-[var(--surface)] p-10 lg:flex lg:flex-col lg:justify-between xl:p-14">
          <div>
            <p className="label-mono flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 bg-[var(--accent)]" aria-hidden="true" />
              Access / inspection console
            </p>
            <h2 className="mt-4 max-w-[11ch] font-display text-[clamp(2.4rem,3.6vw,3.75rem)] font-semibold leading-[0.98] tracking-[-0.045em] text-[var(--ink)]">
              The line is already running.
            </h2>
            <p className="mt-4 max-w-[38ch] text-sm leading-relaxed text-[var(--ink-2)]">
              Sign in to inspect addresses, send a batch through the line, and keep every verdict in
              one register.
            </p>
          </div>

          <div className="my-10 border border-[var(--line-strong)] bg-[var(--surface)]">
            <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-4 py-2.5">
              <p className="label-mono text-[var(--ink-2)]">Specimen verdict</p>
              <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--ink-3)]">
                No. 0042 / sample
              </p>
            </div>
            <div className="p-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="label-mono">Quality score</p>
                  <p className="mt-1 font-display text-6xl font-semibold leading-none tracking-[-0.05em] text-[var(--ink)] tabular">
                    94
                    <span className="ml-1 font-mono text-[11px] font-normal tracking-normal text-[var(--ink-3)]">
                      / 100
                    </span>
                  </p>
                </div>
                <span className="stamp stamp-pass">Clear</span>
              </div>

              <div className="mt-5 flex h-2.5 gap-[2px]" aria-hidden="true">
                {SCORE_BANDS.map((band) => (
                  <span
                    key={band.short}
                    style={{ width: `${band.span}%`, backgroundColor: band.color }}
                  />
                ))}
              </div>
              <div className="mt-2 flex justify-between font-mono text-[9px] text-[var(--ink-3)]">
                <span>0</span>
                <span>25</span>
                <span>50</span>
                <span>75</span>
                <span>100</span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-px border-t border-[var(--line)] bg-[var(--line)] pt-px">
                <div className="bg-[var(--surface)] pt-3 pr-3">
                  <p className="label-mono text-[8px]">Domain</p>
                  <p className="mt-1 font-mono text-[11px] text-[var(--ink)]">northwind.co</p>
                </div>
                <div className="bg-[var(--surface)] pl-3 pt-3">
                  <p className="label-mono text-[8px]">Status</p>
                  <p className="mt-1 font-mono text-[11px] text-[var(--status-valid-text)]">
                    valid
                  </p>
                </div>
              </div>
            </div>
          </div>

          <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--ink-3)]">
            One score. Six checks. No guesswork.
          </p>
        </aside>

        <main className="flex items-center justify-center px-5 py-10 sm:px-8 lg:px-12 lg:py-16">
          <div className="w-full max-w-[420px]">
            <p className="label-mono flex items-center gap-2">
              <span className="h-1.5 w-1.5 bg-[var(--accent)]" aria-hidden="true" />
              {eyebrow}
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)]">
              {title}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">{description}</p>

            <div className="mt-6 border border-[var(--line-strong)] bg-[var(--surface)] p-5 sm:p-6">
              {children}
            </div>

            {footer && <div className="mt-4">{footer}</div>}
          </div>
        </main>
      </div>
    </div>
  );
}
