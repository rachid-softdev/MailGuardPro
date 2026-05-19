// Sentry configuration for error tracking
// Install: npm install @sentry/nextjs

import * as Sentry from "@sentry/nextjs";

/**
 * Initialize Sentry for the application
 * Only runs in production to avoid unnecessary overhead in development
 */
export function initSentry() {
  if (process.env.NODE_ENV === "production" && process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,

      // Performance monitoring
      tracesSampleRate: 0.1, // 10% of transactions

      // Session replay (optional - requires more setup)
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,

      // Environment
      environment: process.env.NODE_ENV,

      // Filter out common non-critical errors
      beforeSend(event, hint) {
        const error = hint.originalException;

        // Ignore network errors that are handled gracefully
        if (error instanceof TypeError && error.message.includes("fetch")) {
          // Only report if it's not a handled error
          return null;
        }

        return event;
      },
    });
  }
}

/**
 * Capture a custom message with optional context
 */
export function captureMessage(
  message: string,
  level: "fatal" | "error" | "warning" | "info" = "info",
  context?: Record<string, any>,
) {
  if (process.env.NODE_ENV === "production") {
    Sentry.captureMessage(message, {
      level,
      extra: context,
    });
  }
}

/**
 * Capture an exception with additional context
 */
export function captureException(error: Error, context?: Record<string, any>) {
  if (process.env.NODE_ENV === "production") {
    Sentry.captureException(error, {
      extra: context,
    });
  }
}

/**
 * Add user context to all events
 */
export function setUser(user: { id: string; email?: string } | null) {
  if (process.env.NODE_ENV === "production") {
    Sentry.setUser(user);
  }
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(
  message: string,
  category: string = "general",
  level: "fatal" | "error" | "warning" | "info" | "debug" = "info",
) {
  if (process.env.NODE_ENV === "production") {
    Sentry.addBreadcrumb({
      message,
      category,
      level,
      timestamp: Date.now() / 1000,
    });
  }
}

// Initialize on module load (optional)
// initSentry()

export default Sentry;
