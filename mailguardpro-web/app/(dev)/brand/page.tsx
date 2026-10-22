import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { BrandMark, Wordmark } from "@/components/brand/BrandMark";
import { DevBadge } from "@/components/dev/DevBadge";
import { Badge } from "@/components/ui/atoms/Badge";
import { Button } from "@/components/ui/atoms/Button";
import { Input } from "@/components/ui/atoms/Input";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ScoreGauge, ScoreMeter } from "@/components/validator/ScoreGauge";
import { SCORE_BANDS } from "@/lib/score";

const SURFACES = [
  { name: "Paper", token: "--bg", note: "Page ground" },
  { name: "Sheet", token: "--surface", note: "Panels and cards" },
  { name: "Stock", token: "--surface-2", note: "Insets and table heads" },
  { name: "Rule", token: "--line", note: "Hairline borders" },
  { name: "Rule strong", token: "--line-strong", note: "Hover and emphasis" },
];

const INKS = [
  { name: "Graphite", token: "--ink", note: "Primary text" },
  { name: "Pencil", token: "--ink-2", note: "Secondary text" },
  { name: "Faint", token: "--ink-3", note: "Labels and metadata" },
  { name: "Reversed", token: "--ink-inverse", note: "Text on ink" },
];

const SIGNALS = [
  { name: "Signal orange", token: "--accent", note: "Action and attention" },
  { name: "Orange pressed", token: "--accent-hover", note: "Hover state" },
  { name: "Orange wash", token: "--accent-soft", note: "Quiet emphasis" },
  { name: "Routing blue", token: "--route", note: "Information, links" },
  { name: "Blue wash", token: "--route-soft", note: "Informational ground" },
];

function Swatch({ name, token, note }: { name: string; token: string; note: string }) {
  return (
    <div className="border border-[var(--line)] bg-[var(--surface)]">
      <div
        className="h-16 w-full border-b border-[var(--line)]"
        style={{ background: `var(${token})` }}
      />
      <div className="space-y-1 p-3">
        <p className="text-[12px] font-semibold text-[var(--ink)]">{name}</p>
        <p className="font-mono text-[10px] text-[var(--ink-2)]">{token}</p>
        <p className="text-[10px] leading-snug text-[var(--ink-3)]">{note}</p>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--accent-text)]">
        {children}
      </span>
      <span className="h-px flex-1 bg-[var(--line)]" />
    </div>
  );
}

export default function BrandPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12 pb-24">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-8">
        <div>
          <div className="mb-3 flex items-center gap-3">
            <h1 className="font-display text-3xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
              The Sorting Floor
            </h1>
            <DevBadge />
          </div>
          <p className="max-w-[62ch] text-sm leading-relaxed text-[var(--ink-2)]">
            The visual system behind MailGuard Pro. Cool paper, graphite, signal orange, and routing
            blue. Instruments first, decoration last.
          </p>
        </div>
        <div className="flex items-center gap-4 border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
          <BrandMark size={32} className="text-[var(--ink)]" />
          <Wordmark />
        </div>
      </div>

      <section className="mb-14">
        <SectionLabel>01 / Surfaces</SectionLabel>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {SURFACES.map((swatch) => (
            <Swatch key={swatch.token} {...swatch} />
          ))}
        </div>
      </section>

      <section className="mb-14">
        <SectionLabel>02 / Ink and signal</SectionLabel>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[...INKS, ...SIGNALS].map((swatch) => (
            <Swatch key={swatch.token} {...swatch} />
          ))}
        </div>
      </section>

      <section className="mb-14">
        <SectionLabel>03 / Type</SectionLabel>
        <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          <div className="border border-[var(--line)] bg-[var(--surface)] p-6">
            <div className="mb-4 flex items-center justify-between">
              <p className="label-mono">Archivo / display and UI</p>
              <span className="font-mono text-[10px] text-[var(--ink-3)]">100–900</span>
            </div>
            <p className="font-display text-4xl font-semibold leading-[0.95] tracking-[-0.045em] text-[var(--ink)] sm:text-5xl">
              Every address
              <br />
              gets a verdict.
            </p>
            <p className="mt-5 max-w-[52ch] text-sm leading-relaxed text-[var(--ink-2)]">
              Archivo carries the argument. Tight tracking at display sizes, normal spacing for
              reading. Never letterspace body copy.
            </p>
          </div>

          <div className="border border-[var(--line)] bg-[var(--surface)] p-6">
            <div className="mb-4 flex items-center justify-between">
              <p className="label-mono">Spline Sans Mono / instruments</p>
              <span className="font-mono text-[10px] text-[var(--ink-3)]">300–700</span>
            </div>
            <p className="font-mono text-3xl font-medium leading-none text-[var(--ink)]">
              hello@acme.com
            </p>
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
              verdict 94 / 100 · clear to send
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <ScoreMeter score={94} />
              <Badge variant="success">Deliverable</Badge>
              <Badge variant="outline">mx: verified</Badge>
            </div>
            <p className="mt-5 text-[11px] leading-relaxed text-[var(--ink-3)]">
              Emails, scores, IDs, timestamps, keyboard hints, and table labels always use the mono
              face. It is the sound of the instrument.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 border border-[var(--line)] bg-[var(--surface)] p-6 sm:grid-cols-4">
          {[
            ["Display", "text-2xl / sm:text-4xl", "font-display text-2xl sm:text-4xl"],
            ["Heading", "text-xl / sm:text-2xl", "font-display text-xl font-semibold sm:text-2xl"],
            ["Body", "text-sm / 1.5", "text-sm"],
            ["Label", "text-2xs / mono", "font-mono text-[10px] uppercase tracking-[0.06em]"],
          ].map(([label, meta, classes]) => (
            <div key={label}>
              <p className={`${classes} text-[var(--ink)]`}>{label}</p>
              <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--ink-3)]">
                {meta}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-14">
        <SectionLabel>04 / Score language</SectionLabel>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="border border-[var(--line)] bg-[var(--surface)] p-6">
            <ScoreGauge score={94} label="Sample inspection" />
            <p className="mt-6 border-t border-[var(--line)] pt-4 text-[11px] leading-relaxed text-[var(--ink-2)]">
              The number stays in graphite. The band carries the verdict. The needle is the only
              moving part.
            </p>
          </div>
          <div className="border border-[var(--line)] bg-[var(--surface)] p-6">
            <ScoreGauge score={34} label="High-risk sample" />
            <p className="mt-6 border-t border-[var(--line)] pt-4 text-[11px] leading-relaxed text-[var(--ink-2)]">
              Orange is not automatically bad. It is a signal to look closer. Red is a stop.
            </p>
          </div>
        </div>

        <div className="mt-4 border border-[var(--line)] bg-[var(--surface)]">
          <div className="panel-head">
            <span className="panel-title">Calibrated bands</span>
            <span className="font-mono text-[10px] text-[var(--ink-3)]">0–100</span>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {SCORE_BANDS.map((band) => (
              <div key={band.short} className="flex items-center gap-4 px-4 py-3">
                <span className="w-24 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-2)]">
                  {band.short}
                </span>
                <span className="w-16 font-mono text-[10px] tabular text-[var(--ink-3)]">
                  {band.min}–{band.max}
                </span>
                <span
                  className="h-2 w-2 shrink-0"
                  style={{ backgroundColor: band.color }}
                  aria-hidden="true"
                />
                <span className="text-[12px] text-[var(--ink)]">{band.label}</span>
                <span className="ml-auto">
                  <ScoreMeter score={band.max - 2} showNumber={false} />
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mb-14">
        <SectionLabel>05 / Status stamps</SectionLabel>
        <div className="flex flex-wrap items-center gap-3 border border-[var(--line)] bg-[var(--surface)] p-6">
          <StatusBadge status="valid" />
          <StatusBadge status="invalid" />
          <StatusBadge status="risky" />
          <StatusBadge status="unknown" />
          <span className="ml-2 text-[11px] text-[var(--ink-3)]">
            Green is reserved for a valid verdict and a clear score. It never means “success”
            generically.
          </span>
        </div>
      </section>

      <section className="mb-14">
        <SectionLabel>06 / Controls</SectionLabel>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="border border-[var(--line)] bg-[var(--surface)] p-6">
            <p className="label-mono mb-4">Buttons</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary">Primary</Button>
              <Button variant="accent">Accent</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
              <Button variant="link">Link</Button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
              <Button loading>Loading</Button>
              <Button disabled>Disabled</Button>
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-[var(--ink-3)]">
              One accent action per view. Primary ink is for the main commitment; orange is for
              inspection and attention.
            </p>
          </div>

          <div className="border border-[var(--line)] bg-[var(--surface)] p-6">
            <p className="label-mono mb-4">Badges and input</p>
            <div className="flex flex-wrap gap-2">
              <Badge>Default</Badge>
              <Badge variant="accent">Accent</Badge>
              <Badge variant="success">Success</Badge>
              <Badge variant="warning">Warning</Badge>
              <Badge variant="danger">Danger</Badge>
              <Badge variant="outline">Outline</Badge>
            </div>
            <div className="mt-5 space-y-2">
              <label
                htmlFor="brand-email"
                className="block font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-2)]"
              >
                Inspect an address
              </label>
              <Input id="brand-email" defaultValue="hello@acme.com" />
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-[var(--ink-3)]">
              Inputs use the mono face. Labels are uppercase instrument markings, not sentences.
            </p>
          </div>
        </div>
      </section>

      <section className="mb-14">
        <SectionLabel>07 / Rules of the floor</SectionLabel>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="border border-[var(--line)] bg-[var(--surface)] p-6">
            <p className="label-mono mb-3 text-[var(--status-valid-text)]">Do</p>
            <ul className="space-y-2 text-[12px] leading-relaxed text-[var(--ink-2)]">
              <li>Use 2px radii, hairline rules, and flat surfaces.</li>
              <li>Let mono labels and numbers carry the instrument feel.</li>
              <li>Use orange for action, attention, and the final CTA.</li>
              <li>Keep green for valid verdicts and clear scores only.</li>
              <li>Write short, declarative sentences with a postal edge.</li>
            </ul>
          </div>
          <div className="border border-[var(--line)] bg-[var(--surface)] p-6">
            <p className="label-mono mb-3 text-[var(--status-invalid-text)]">Don’t</p>
            <ul className="space-y-2 text-[12px] leading-relaxed text-[var(--ink-2)]">
              <li>Use gradients, glows, glassmorphism, or decorative shadows.</li>
              <li>Use warm cream paper or soft green “SaaS” accents.</li>
              <li>Round cards like consumer software. The floor is squared.</li>
              <li>Use emoji, mascots, or hype copy.</li>
              <li>Use green for generic success states.</li>
            </ul>
          </div>
        </div>
      </section>

      <section>
        <SectionLabel>08 / Implementation notes</SectionLabel>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="border border-[var(--line)] bg-[var(--surface)] p-5">
            <p className="label-mono mb-2">Fonts</p>
            <p className="text-[12px] leading-relaxed text-[var(--ink-2)]">
              Self-hosted in <span className="font-mono text-[11px]">public/fonts</span>. Never
              reintroduce Google Fonts: the CSP allows{" "}
              <span className="font-mono text-[11px]">font-src &apos;self&apos; data:</span> only.
            </p>
          </div>
          <div className="border border-[var(--line)] bg-[var(--surface)] p-5">
            <p className="label-mono mb-2">Tokens</p>
            <p className="text-[12px] leading-relaxed text-[var(--ink-2)]">
              New work uses semantic tokens: <span className="font-mono text-[11px]">--ink</span>,{" "}
              <span className="font-mono text-[11px]">--surface</span>,{" "}
              <span className="font-mono text-[11px]">--line</span>, and{" "}
              <span className="font-mono text-[11px]">--accent</span>. The legacy aliases were
              removed once every surface had migrated.
            </p>
          </div>
          <div className="border border-[var(--line)] bg-[var(--surface)] p-5">
            <p className="label-mono mb-2">Migration</p>
            <p className="text-[12px] leading-relaxed text-[var(--ink-2)]">
              Every surface is on the new system: landing, dashboard, pricing, auth, docs,
              validator, bulk, history, billing, settings, API keys, webhooks, deliveries, and
              admin.
            </p>
          </div>
        </div>
      </section>

      <p className="mt-12 border-t border-[var(--line)] pt-4 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
        MailGuard Pro · internal brand sheet · development only
      </p>
    </div>
  );
}
