import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Component modules use the classic JSX runtime (no React import), so React
// must be available as a global when rendering them in node.
(globalThis as any).React = React;

const { mockCaptureException } = vi.hoisted(() => ({ mockCaptureException: vi.fn() }));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn() },
}));
vi.mock("@/lib/sentry", () => ({
  captureException: mockCaptureException,
  captureMessage: vi.fn(),
  initSentry: vi.fn(),
  setUser: vi.fn(),
  addBreadcrumb: vi.fn(),
  default: {},
}));

import { ErrorBoundary, ErrorFallback } from "@/components/ErrorBoundary";

describe("ErrorBoundary", () => {
  it("should be defined", () => {
    expect(ErrorBoundary).toBeDefined();
  });

  it("should be a function component", () => {
    expect(typeof ErrorBoundary).toBe("function");
  });

  describe("ErrorFallback", () => {
    it("should be defined", () => {
      expect(ErrorFallback).toBeDefined();
    });

    it("renders the provided message", () => {
      const html = renderToStaticMarkup(React.createElement(ErrorFallback, { message: "Boom!" }));
      expect(html).toContain("Boom!");
    });
  });

  describe("rendering (P2)", () => {
    it("getDerivedStateFromError sets hasError with the error", () => {
      const state = ErrorBoundary.getDerivedStateFromError(new Error("x"));
      expect(state.hasError).toBe(true);
      expect(state.error).toBeInstanceOf(Error);
    });

    it("captures and reports a child error via the boundary lifecycle", () => {
      const boundary = new ErrorBoundary({ children: null });
      const err = new Error("boom");
      const state = ErrorBoundary.getDerivedStateFromError(err);
      expect(state.hasError).toBe(true);
      boundary.componentDidCatch(err, { componentStack: "..." } as any);
      expect(mockCaptureException).toHaveBeenCalledWith(err, expect.anything());
    });
  });
});
