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

import { UndoProvider } from "@/components/undo/UndoProvider";
import SettingsPage from "@/app/(dashboard)/settings/page";

describe("SettingsPage render smoke (P2)", () => {
  it("is a function component", () => {
    expect(typeof SettingsPage).toBe("function");
  });

  it("renders its initial loading state without throwing", () => {
    let html = "";
    expect(() => {
      html = renderToStaticMarkup(
        React.createElement(UndoProvider, null, React.createElement(SettingsPage)),
      );
    }).not.toThrow();
    // Initial render shows the loading skeleton (useEffect fetch has not resolved)
    expect(html).toContain("animate-skeleton");
  });
});
