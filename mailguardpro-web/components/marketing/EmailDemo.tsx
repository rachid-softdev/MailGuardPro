"use client";

import { useCallback, useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ScoreCircle } from "@/components/validator/ScoreCircle";

interface CheckItem {
  name: string;
  pass: boolean;
}

const defaultChecks: CheckItem[] = [
  { name: "Format", pass: true },
  { name: "Domain", pass: true },
  { name: "MX Records", pass: true },
  { name: "Disposable", pass: false },
  { name: "Spam Trap", pass: true },
];

export default function EmailDemo() {
  const [email, setEmail] = useState("test@example.com");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    score: number;
    status: "valid" | "risky" | "invalid";
    checks: CheckItem[];
  } | null>(null);

  const handleAnalyze = useCallback(() => {
    setLoading(true);
    setResult(null);

    setTimeout(() => {
      const score = Math.floor(Math.random() * 26) + 70; // 70–95
      const status: "valid" | "risky" | "invalid" =
        score >= 80 ? "valid" : score >= 60 ? "risky" : "invalid";

      setResult({ score, status, checks: defaultChecks });
      setLoading(false);
    }, 1200);
  }, []);

  return (
    <div className="text-center py-8">
      <p className="text-[var(--text-muted)] mb-4">Enter an email to see the score</p>

      <div className="flex gap-2 max-w-md mx-auto">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter an email address"
          className="input flex-1"
          disabled={loading}
        />
        <button
          className="btn btn-accent min-w-[100px]"
          onClick={handleAnalyze}
          disabled={loading || !email}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Checking</span>
            </span>
          ) : (
            "Analyze"
          )}
        </button>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="mt-8 space-y-4" aria-label="Loading results">
          <div className="flex justify-center">
            <div className="w-28 h-28 rounded-full animate-skeleton" />
          </div>
          <div className="flex justify-center">
            <div className="w-20 h-6 rounded-full animate-skeleton" />
          </div>
          <div className="space-y-2 max-w-xs mx-auto">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-5 rounded animate-skeleton" />
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="mt-8 animate-fade-up" style={{ opacity: 0 }}>
          <div className="flex flex-col items-center gap-4">
            <ScoreCircle score={result.score} size="lg" />

            <StatusBadge status={result.status} />

            <div className="w-full max-w-xs space-y-2 mt-2">
              {result.checks.map((check) => (
                <div
                  key={check.name}
                  className="flex items-center justify-between text-sm px-4 py-2 rounded-lg"
                  style={{ backgroundColor: "var(--bg-subtle)" }}
                >
                  <span className="text-[var(--text-secondary)]">{check.name}</span>
                  {check.pass ? (
                    <svg
                      className="w-4 h-4 text-[var(--status-valid)]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-label="Pass"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-4 h-4 text-[var(--status-invalid)]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-label="Fail"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
