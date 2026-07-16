import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Next pages use the classic JSX runtime (no React import in the module),
// so React must be available as a global when rendering them in node.
(globalThis as any).React = React;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { UndoHistoryProvider } from "@/hooks/useUndoHistory";
import HistoryPage from "@/app/(dashboard)/history/page";

describe("HistoryPage render smoke (P2)", () => {
  it("is a function component", () => {
    expect(typeof HistoryPage).toBe("function");
  });

  it("renders its initial loading state without throwing", () => {
    let html = "";
    expect(() => {
      html = renderToStaticMarkup(
        React.createElement(UndoHistoryProvider, null, React.createElement(HistoryPage)),
      );
    }).not.toThrow();
    // Initial render shows the loading skeleton (data fetch not yet resolved)
    expect(html).toContain("animate-skeleton");
  });
});
