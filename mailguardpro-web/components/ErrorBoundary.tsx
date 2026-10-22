"use client";

import { Component, ReactNode } from "react";
import { Button, Card } from "@/components/ui";
// Note: logger import is safe in client components — pino auto-detects browser
// environment and uses pino/browser in production builds (no transport needed).
import { logger } from "@/lib/logger";
import { captureException } from "@/lib/sentry";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: any) {
    logger.error({ err: error, errorInfo }, "ErrorBoundary caught an error");

    captureException(error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--bg)]">
          <Card variant="default" padding="md" className="max-w-md text-center">
            <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center border border-[var(--status-invalid)]/40 bg-[var(--status-invalid-bg)]">
              <svg
                className="h-5 w-5 text-[var(--status-invalid-text)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </span>
            <h2 className="mb-2 font-display text-xl font-semibold tracking-[-0.02em] text-[var(--ink)]">
              Something went wrong
            </h2>
            <p className="mb-4 text-[13px] text-[var(--ink-2)]">
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <div className="flex justify-center gap-3">
              <Button variant="primary" onClick={() => (window.location.href = "/dashboard")}>
                Go to Dashboard
              </Button>
              <Button variant="ghost" onClick={() => this.setState({ hasError: false })}>
                Try Again
              </Button>
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

// Simple error fallback component
export function ErrorFallback({ message = "Something went wrong" }: { message?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--bg)]">
      <Card variant="default" padding="md" className="max-w-md text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center border border-[var(--status-invalid)]/40 bg-[var(--status-invalid-bg)]">
          <svg
            className="h-5 w-5 text-[var(--status-invalid-text)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </span>
        <h2 className="mb-2 font-display text-xl font-semibold tracking-[-0.02em] text-[var(--ink)]">
          Something went wrong
        </h2>
        <p className="mb-4 text-[13px] text-[var(--ink-2)]">{message}</p>
        <Button variant="primary" onClick={() => window.location.reload()}>
          Reload Page
        </Button>
      </Card>
    </div>
  );
}

export default ErrorBoundary;
