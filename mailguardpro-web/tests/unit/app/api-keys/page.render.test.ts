import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

// Next pages use the classic JSX runtime (no React import in the module),
// so React must be available as a global when rendering them in node.
(globalThis as any).React = React;

import ApiKeysPage from "@/app/(dashboard)/api-keys/page";
import { SCOPE_OPTIONS } from "@/app/(dashboard)/api-keys/scopeOptions";
import { UndoProvider } from "@/components/undo/UndoProvider";
import { VALID_SCOPES } from "@/lib/auth/require-scope";

describe("ApiKeysPage render smoke (wave 7)", () => {
  it("is a function component", () => {
    expect(typeof ApiKeysPage).toBe("function");
  });

  it("renders its initial loading state without throwing", () => {
    let html = "";
    expect(() => {
      html = renderToStaticMarkup(
        React.createElement(UndoProvider, null, React.createElement(ApiKeysPage)),
      );
    }).not.toThrow();
    // Initial render shows the loading skeleton (useEffect fetch has not resolved)
    expect(html).toContain("animate-skeleton");
    expect(html).toContain("API Keys");
  });

  it("offers exactly the scopes accepted by the API", () => {
    expect(SCOPE_OPTIONS.map((option) => option.value)).toEqual(VALID_SCOPES);
  });
});
