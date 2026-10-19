/**
 * instrumentation.ts register() runs in every runtime Next.js boots.
 * The disposable-domain bootstrap must only run in the Node.js runtime —
 * importing it in Edge pulls Node-only builtins (crypto via the logger,
 * dns/net via the SSRF guard) into the Edge bundle (audit O2).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockInit } = vi.hoisted(() => ({ mockInit: vi.fn() }));

vi.mock("@/services/disposableChecker", () => ({
  initializeDisposableDomains: mockInit,
}));

import { register } from "@/instrumentation";

const originalRuntime = process.env.NEXT_RUNTIME;

describe("instrumentation register()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInit.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalRuntime === undefined) {
      delete process.env.NEXT_RUNTIME;
    } else {
      process.env.NEXT_RUNTIME = originalRuntime;
    }
  });

  it("initializes disposable domains in the Node.js runtime", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    await register();
    expect(mockInit).toHaveBeenCalledTimes(1);
  });

  it("does not load the checker in the Edge runtime", async () => {
    process.env.NEXT_RUNTIME = "edge";
    await register();
    expect(mockInit).not.toHaveBeenCalled();
  });

  it("does not load the checker when NEXT_RUNTIME is undefined", async () => {
    delete process.env.NEXT_RUNTIME;
    await register();
    expect(mockInit).not.toHaveBeenCalled();
  });

  it("swallows bootstrap errors so server startup is not blocked", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    mockInit.mockRejectedValue(new Error("network down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(register()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });
});
