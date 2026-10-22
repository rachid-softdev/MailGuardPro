import Link from "next/link";
import { notFound } from "next/navigation";
import { DevBadge } from "@/components/dev/DevBadge";

const QUICK_LINKS = [
  {
    label: "Email Previews",
    href: "/pages/email-preview",
    description: "Welcome & bulk-completed templates",
  },
  {
    label: "Validation Playground",
    href: "/pages/validation",
    description: "Test email syntax validation",
  },
  { label: "404 Preview", href: "/404-preview", description: "Preview the not-found page" },
  { label: "Brand", href: "/brand", description: "Design tokens & components" },
];

const STATE_PREVIEWS = [
  { label: "Default", className: "bg-[var(--surface)] border-[var(--line)]" },
  { label: "Success", className: "bg-[var(--status-valid-bg)] border-[var(--status-valid)]" },
  { label: "Warning", className: "bg-[var(--status-risky-bg)] border-[var(--status-risky)]" },
  { label: "Error", className: "bg-[var(--status-invalid-bg)] border-[var(--status-invalid)]" },
];

export default function DevHubPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-10 border-b border-[var(--line)] pb-5">
        <div className="flex items-center gap-3">
          <p className="label-mono flex items-center gap-2">
            <span className="h-1.5 w-1.5 bg-[var(--accent)]" aria-hidden="true" />
            Internal / development
          </p>
          <DevBadge />
        </div>
        <h1 className="mt-2 font-display text-[clamp(1.9rem,3.2vw,2.6rem)] font-semibold leading-none tracking-[-0.04em] text-[var(--ink)]">
          Developer Hub.
        </h1>
        <p className="mt-2 text-[13px] text-[var(--ink-2)]">
          Internal tools and previews for MailGuard Pro. Development only.
        </p>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
          Quick Links
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group border border-[var(--line)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--accent)] hover:bg-[var(--surface-2)]"
            >
              <div className="text-[13px] font-semibold text-[var(--ink)] transition-colors group-hover:text-[var(--accent)]">
                {link.label}
              </div>
              <div className="mt-1 text-[11px] text-[var(--ink-3)]">{link.description}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
          State Previews
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STATE_PREVIEWS.map((state) => (
            <div key={state.label} className={`border p-4 text-center ${state.className}`}>
              <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--ink-2)]">
                {state.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
          Technical Details
        </h2>
        <div className="border border-[var(--line)] bg-[var(--surface)] p-5">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
            <div>
              <dt className="label-mono">Framework</dt>
              <dd className="mt-0.5 font-medium text-[var(--ink)]">Next.js App Router</dd>
            </div>
            <div>
              <dt className="label-mono">Styling</dt>
              <dd className="mt-0.5 font-medium text-[var(--ink)]">Tailwind CSS v4</dd>
            </div>
            <div>
              <dt className="label-mono">Accent</dt>
              <dd className="mt-1 flex items-center gap-2">
                <span className="h-2.5 w-2.5 bg-[var(--accent)]" aria-hidden="true" />
                <span className="font-mono text-[11px] text-[var(--ink-2)]">
                  oklch(0.63 0.19 42)
                </span>
              </dd>
            </div>
            <div>
              <dt className="label-mono">Fonts</dt>
              <dd className="mt-0.5 font-medium text-[var(--ink)]">Archivo / Spline Sans Mono</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}
