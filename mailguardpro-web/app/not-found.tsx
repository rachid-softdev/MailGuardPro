"use client";

import { FileQuestion, Home } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl flex items-center justify-center shadow-[var(--shadow-md)]">
            <FileQuestion className="w-10 h-10 text-[var(--text-muted)]" />
          </div>
        </div>
        <h1 className="text-7xl md:text-8xl font-display font-extrabold text-[var(--text-primary)] mb-4 tracking-tight">
          404
        </h1>
        <h2 className="text-2xl font-display font-bold mb-3">Page Not Found</h2>
        <p className="text-[var(--text-secondary)] mb-8 leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link href="/" className="btn btn-accent btn-lg inline-flex items-center gap-2">
          <Home className="w-5 h-5" />
          Go Home
        </Link>
      </div>
    </div>
  );
}
