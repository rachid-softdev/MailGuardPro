"use client";

import { FileQuestion, Home } from "lucide-react";
import { Button } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center border border-[var(--line-strong)] bg-[var(--surface)]">
            <FileQuestion className="h-6 w-6 text-[var(--ink-3)]" aria-hidden="true" />
          </div>
        </div>
        <p className="label-mono mb-2">Error / 404</p>
        <h1 className="mb-3 font-display text-[clamp(4rem,14vw,7rem)] font-semibold leading-none tracking-[-0.06em] text-[var(--ink)]">
          404
        </h1>
        <h2 className="mb-3 font-display text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
          Page not found
        </h2>
        <p className="mb-8 text-[13px] leading-relaxed text-[var(--ink-2)]">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Button href="/" variant="accent" size="lg" className="inline-flex items-center gap-2">
          <Home className="h-4 w-4" aria-hidden="true" />
          Go Home
        </Button>
      </div>
    </div>
  );
}
