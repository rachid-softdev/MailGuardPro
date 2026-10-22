"use client";

import { notFound } from "next/navigation";
import { useState } from "react";
import { DevBadge } from "@/components/dev/DevBadge";

interface ValidationResult {
  email: string;
  valid: boolean;
  errors: string[];
}

function validateEmail(email: string): ValidationResult {
  const errors: string[] = [];

  if (!email) {
    return { email, valid: false, errors: ["Email is required"] };
  }

  if (!email.includes("@")) {
    errors.push("Missing @ symbol");
  }

  const [local, domain] = email.split("@");
  if (!local) {
    errors.push("Missing local part");
  }
  if (!domain) {
    errors.push("Missing domain");
  } else {
    if (!domain.includes(".")) {
      errors.push("Domain must contain a dot");
    }
    if (domain.startsWith(".") || domain.endsWith(".")) {
      errors.push("Domain cannot start or end with a dot");
    }
    if (/\s/.test(email)) {
      errors.push("Email must not contain whitespace");
    }
    if (/[^a-zA-Z0-9@._%+\-]/.test(email)) {
      errors.push("Contains invalid characters");
    }
  }

  return { email, valid: errors.length === 0, errors };
}

const PRESET_EMAILS = [
  "user@example.com",
  "test@gmail.com",
  "invalid-email",
  "missing@domain",
  "@no-local.com",
  "has space@test.com",
  "user@.invalid.com",
  "user@domain",
  "first.last@company.co.uk",
  "",
];

export default function ValidationPlaygroundPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  const [input, setInput] = useState("");
  const [results, setResults] = useState<ValidationResult[]>([]);

  const handleValidate = () => {
    if (!input.trim()) return;
    const result = validateEmail(input.trim());
    setResults((prev) => [result, ...prev]);
    setInput("");
  };

  const handlePreset = (email: string) => {
    setInput(email);
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-10 border-b border-[var(--line)] pb-5">
        <div className="flex items-center gap-3">
          <p className="label-mono flex items-center gap-2">
            <span className="h-1.5 w-1.5 bg-[var(--accent)]" aria-hidden="true" />
            Internal / validation
          </p>
          <DevBadge />
        </div>
        <h1 className="mt-2 font-display text-[clamp(1.9rem,3.2vw,2.6rem)] font-semibold leading-none tracking-[-0.04em] text-[var(--ink)]">
          Validation Playground.
        </h1>
        <p className="mt-2 text-[13px] text-[var(--ink-2)]">Test email syntax validation logic.</p>
      </header>

      <section className="mb-8 border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleValidate()}
            placeholder="Enter an email address..."
            className="input flex-1"
          />
          <button onClick={handleValidate} className="btn btn-accent btn-md whitespace-nowrap">
            Validate
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          <span className="label-mono self-center">Presets</span>
          {PRESET_EMAILS.filter(Boolean).map((email) => (
            <button
              key={email}
              onClick={() => handlePreset(email)}
              className="btn btn-ghost btn-sm font-mono text-[11px]"
            >
              {email}
            </button>
          ))}
        </div>
      </section>

      {results.length > 0 && (
        <div className="space-y-2">
          <h2 className="label-mono mb-3">Results</h2>
          {results.map((result, i) => (
            <div
              key={`${result.email}-${i}`}
              className={`border border-l-2 p-4 ${
                result.valid
                  ? "border-[var(--line)] border-l-[var(--status-valid)] bg-[var(--status-valid-bg)]"
                  : "border-[var(--line)] border-l-[var(--status-invalid)] bg-[var(--status-invalid-bg)]"
              }`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className={result.valid ? "stamp stamp-pass" : "stamp stamp-fail"}>
                  {result.valid ? "Valid" : "Invalid"}
                </span>
                <span className="font-mono text-[12px] text-[var(--ink)]">{result.email}</span>
              </div>
              {result.errors.length > 0 && (
                <ul className="mt-2 ml-1 space-y-0.5 text-[11px] text-[var(--ink-2)]">
                  {result.errors.map((err) => (
                    <li key={err}>— {err}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
