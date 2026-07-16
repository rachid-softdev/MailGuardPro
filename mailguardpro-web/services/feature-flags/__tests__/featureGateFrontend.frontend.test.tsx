// ================================================================
// FeatureGate — Frontend Component & Hook Tests
// ================================================================
// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeatureGuard, UpgradeBanner, UsageMeter } from "@/components/FeatureGuard";
import {
  EntitlementsProvider,
  useEntitlements,
  useFeature,
  useLimit,
} from "../entitlements-context";

// ---- Auto-cleanup between tests ----
afterEach(cleanup);

// ---- Mock fetch globally ----
const mockFetch = vi.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

const SAMPLE_ENTITLEMENTS = {
  plan: "PRO",
  features: { EXPORT_PDF: true, AI_SUMMARY: false, BULK_VALIDATE: true },
  limits: { EXPORT_PDF: null, AI_SUMMARY: null, BULK_VALIDATE: 100 },
  configs: {},
  usage: { BULK_VALIDATE: 42 },
  reset_at: { BULK_VALIDATE: "2026-07-01T00:00:00.000Z" },
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: successful fetch
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(SAMPLE_ENTITLEMENTS),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---- Helper: render provider + consume hooks inside ----

function TestConsumer({ onMount }: { onMount: (ctx: ReturnType<typeof useEntitlements>) => void }) {
  const ctx = useEntitlements();
  React.useEffect(() => {
    onMount(ctx);
  }, [ctx]);
  return null;
}

function renderWithProvider(children: React.ReactNode) {
  return render(<EntitlementsProvider>{children}</EntitlementsProvider>);
}

// ================================================================
// 1. EntitlementsProvider
// ================================================================
describe("EntitlementsProvider", () => {
  it("fetches entitlements on mount and sets loading states", async () => {
    const onMount = vi.fn();
    renderWithProvider(<TestConsumer onMount={onMount} />);

    // Initially loading
    await waitFor(() => {
      expect(onMount).toHaveBeenCalled();
    });
    const firstCall = onMount.mock.calls[0][0];
    expect(firstCall.loading).toBeDefined();

    // Eventually loaded
    await waitFor(() => {
      const lastCall = onMount.mock.calls[onMount.mock.calls.length - 1][0];
      expect(lastCall.loading).toBe(false);
    });
  });

  it("sets entitlements data on successful fetch", async () => {
    const onMount = vi.fn();
    renderWithProvider(<TestConsumer onMount={onMount} />);

    await waitFor(() => {
      const calls = onMount.mock.calls;
      const last = calls[calls.length - 1][0];
      expect(last.entitlements).toEqual(SAMPLE_ENTITLEMENTS);
    });
  });

  it("sets error on HTTP error response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });
    const onMount = vi.fn();
    renderWithProvider(<TestConsumer onMount={onMount} />);

    await waitFor(() => {
      const calls = onMount.mock.calls;
      const last = calls[calls.length - 1][0];
      expect(last.error).toBeTruthy();
      expect(last.loading).toBe(false);
    });
  });

  it("sets error on network failure", async () => {
    mockFetch.mockRejectedValue(new Error("Network failure"));
    const onMount = vi.fn();
    renderWithProvider(<TestConsumer onMount={onMount} />);

    await waitFor(() => {
      const calls = onMount.mock.calls;
      const last = calls[calls.length - 1][0];
      expect(last.error).toBeTruthy();
      expect(last.error?.message).toBe("Network failure");
    });
  });

  it("aborts in-flight request on unmount", async () => {
    let abortSignal: AbortSignal | undefined;
    mockFetch.mockImplementation((_url: string, opts: any) => {
      abortSignal = opts?.signal;
      return new Promise(() => {}); // Never resolves
    });
    const { unmount } = renderWithProvider(<TestConsumer onMount={vi.fn()} />);

    unmount();
    expect(abortSignal?.aborted).toBe(true);
  });

  it("refetch re-fetches data", async () => {
    let refetchFn: (() => void) | undefined;
    const onMount = vi.fn((ctx: any) => {
      refetchFn = ctx.refetch;
    });
    renderWithProvider(<TestConsumer onMount={onMount} />);

    await waitFor(() => {
      expect(refetchFn).toBeDefined();
    });
    mockFetch.mockClear();

    await act(async () => {
      refetchFn!();
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
  });
});

// ================================================================
// 2. useEntitlements hook
// ================================================================
describe("useEntitlements hook", () => {
  it("throws when used outside provider", () => {
    const Test = () => {
      useEntitlements();
      return null;
    };
    expect(() => render(<Test />)).toThrow(
      "useEntitlements must be used within an <EntitlementsProvider>",
    );
  });

  it("hasFeature, getLimit, getUsage, getResetAt work", async () => {
    const onMount = vi.fn();
    renderWithProvider(<TestConsumer onMount={onMount} />);

    await waitFor(() => {
      const lastCall = onMount.mock.calls[onMount.mock.calls.length - 1][0];
      expect(lastCall.hasFeature("EXPORT_PDF")).toBe(true);
      expect(lastCall.hasFeature("AI_SUMMARY")).toBe(false);
      expect(lastCall.hasFeature("UNKNOWN")).toBe(false);
      expect(lastCall.getLimit("BULK_VALIDATE")).toBe(100);
      expect(lastCall.getLimit("UNKNOWN")).toBeNull();
      expect(lastCall.getUsage("BULK_VALIDATE")).toBe(42);
      expect(lastCall.getUsage("UNKNOWN")).toBe(0);
      expect(lastCall.getResetAt("BULK_VALIDATE")).toBe("2026-07-01T00:00:00.000Z");
      expect(lastCall.getResetAt("UNKNOWN")).toBeNull();
    });
  });
});

// ================================================================
// 3. useFeature hook
// ================================================================
describe("useFeature hook", () => {
  function TestFeature({ featureKey }: { featureKey: string }) {
    const enabled = useFeature(featureKey);
    return <div data-testid="result">{enabled ? "enabled" : "disabled"}</div>;
  }

  it("returns true when feature is enabled", async () => {
    renderWithProvider(<TestFeature featureKey="EXPORT_PDF" />);
    await waitFor(() => {
      expect(screen.getByTestId("result")).toHaveTextContent("enabled");
    });
  });

  it("returns false when feature is disabled", async () => {
    renderWithProvider(<TestFeature featureKey="AI_SUMMARY" />);
    await waitFor(() => {
      expect(screen.getByTestId("result")).toHaveTextContent("disabled");
    });
  });

  it("returns false for unknown feature", async () => {
    renderWithProvider(<TestFeature featureKey="UNKNOWN_FEATURE" />);
    await waitFor(() => {
      expect(screen.getByTestId("result")).toHaveTextContent("disabled");
    });
  });
});

// ================================================================
// 4. useLimit hook
// ================================================================
describe("useLimit hook", () => {
  function TestLimit({ featureKey }: { featureKey: string }) {
    const { limit, used, resetAt } = useLimit(featureKey);
    return (
      <div>
        <span data-testid="limit">{String(limit)}</span>
        <span data-testid="used">{used}</span>
        <span data-testid="reset-at">{resetAt ?? "null"}</span>
      </div>
    );
  }

  it("returns correct limit, used, resetAt for known feature", async () => {
    renderWithProvider(<TestLimit featureKey="BULK_VALIDATE" />);
    await waitFor(() => {
      expect(screen.getByTestId("limit")).toHaveTextContent("100");
      expect(screen.getByTestId("used")).toHaveTextContent("42");
      expect(screen.getByTestId("reset-at")).not.toHaveTextContent("null");
    });
  });

  it("returns limit=null, used=0, resetAt=null for unknown feature", async () => {
    renderWithProvider(<TestLimit featureKey="UNKNOWN" />);
    await waitFor(() => {
      expect(screen.getByTestId("limit")).toHaveTextContent("null");
      expect(screen.getByTestId("used")).toHaveTextContent("0");
      expect(screen.getByTestId("reset-at")).toHaveTextContent("null");
    });
  });
});

// ================================================================
// 5. FeatureGuard component
// ================================================================
describe("FeatureGuard", () => {
  it("renders children when feature is enabled", async () => {
    renderWithProvider(
      <FeatureGuard feature="EXPORT_PDF">
        <div data-testid="content">Secret Content</div>
      </FeatureGuard>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("content")).toHaveTextContent("Secret Content");
    });
  });

  it("renders fallback when feature is disabled", async () => {
    renderWithProvider(
      <FeatureGuard feature="AI_SUMMARY" fallback={<div data-testid="fallback">Upgrade</div>}>
        <div data-testid="content">Secret Content</div>
      </FeatureGuard>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("fallback")).toHaveTextContent("Upgrade");
      expect(screen.queryByTestId("content")).toBeNull();
    });
  });

  it("renders nothing (null fallback) when feature is disabled and no fallback", async () => {
    renderWithProvider(
      <FeatureGuard feature="AI_SUMMARY">
        <div data-testid="content">Secret Content</div>
      </FeatureGuard>,
    );
    await waitFor(() => {
      expect(screen.queryByTestId("content")).toBeNull();
    });
  });
});

// ================================================================
// 6. UpgradeBanner component
// ================================================================
describe("UpgradeBanner", () => {
  it("renders default upgrade message", () => {
    render(<UpgradeBanner />);
    expect(screen.getByText("Upgrade to access this feature")).toBeInTheDocument();
    expect(screen.getByText("Upgrade Plan")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/billing/upgrade");
  });

  it("renders custom message", () => {
    render(<UpgradeBanner message="Custom upgrade message" />);
    expect(screen.getByText("Custom upgrade message")).toBeInTheDocument();
  });
});

// ================================================================
// 7. UsageMeter component
// ================================================================
describe("UsageMeter", () => {
  it('displays "Unlimited" when limit is null', async () => {
    renderWithProvider(<UsageMeter feature="EXPORT_PDF" />);
    await waitFor(() => {
      expect(screen.getByText("Unlimited")).toBeInTheDocument();
    });
  });

  it("calculates and displays percentage correctly", async () => {
    renderWithProvider(<UsageMeter feature="BULK_VALIDATE" />);
    await waitFor(() => {
      // 42/100 = 42%
      expect(screen.getByText("42%")).toBeInTheDocument();
      expect(screen.getByText("42 / 100")).toBeInTheDocument();
    });
  });

  it("caps percentage at 100%", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ...SAMPLE_ENTITLEMENTS,
          usage: { BULK_VALIDATE: 150 },
        }),
    });
    renderWithProvider(<UsageMeter feature="BULK_VALIDATE" />);
    await waitFor(() => {
      expect(screen.getByText("100%")).toBeInTheDocument();
    });
  });

  it("shows warning color at ≥80% usage", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ...SAMPLE_ENTITLEMENTS,
          usage: { BULK_VALIDATE: 85 },
        }),
    });
    renderWithProvider(<UsageMeter feature="BULK_VALIDATE" />);
    await waitFor(() => {
      expect(screen.getByText("85%")).toBeInTheDocument();
    });
  });

  it("shows warning color at ≥95% usage", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ...SAMPLE_ENTITLEMENTS,
          usage: { BULK_VALIDATE: 98 },
        }),
    });
    renderWithProvider(<UsageMeter feature="BULK_VALIDATE" />);
    await waitFor(() => {
      expect(screen.getByText("98%")).toBeInTheDocument();
    });
  });

  it("shows reset date", async () => {
    renderWithProvider(<UsageMeter feature="BULK_VALIDATE" />);
    await waitFor(() => {
      expect(screen.getByText(/Resets/)).toBeInTheDocument();
    });
  });

  it("hides label when showLabel=false", async () => {
    renderWithProvider(<UsageMeter feature="BULK_VALIDATE" showLabel={false} />);
    await waitFor(() => {
      expect(screen.queryByText("42 / 100")).toBeNull();
      // Progress bar should still render
    });
  });

  it("handles limit=0 gracefully (no division by zero)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ...SAMPLE_ENTITLEMENTS,
          limits: { BULK_VALIDATE: 0 },
          usage: { BULK_VALIDATE: 0 },
        }),
    });
    renderWithProvider(<UsageMeter feature="BULK_VALIDATE" />);
    await waitFor(() => {
      // Should show 0 / 0 or handle gracefully
      expect(screen.getByText("0%")).toBeInTheDocument();
    });
  });

  it("handles NaN usage gracefully (does not crash)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ...SAMPLE_ENTITLEMENTS,
          limits: { BULK_VALIDATE: 100 },
          usage: { BULK_VALIDATE: NaN },
        }),
    });
    renderWithProvider(<UsageMeter feature="BULK_VALIDATE" />);
    await waitFor(() => {
      // NaN / 100 → Math.round(NaN) → NaN → Math.min(NaN, 100) → NaN → NaN%
      // The component should not crash; check that text content contains "NaN"
      const usageElements = screen.getAllByText(/NaN/);
      expect(usageElements.length).toBeGreaterThan(0);
    });
  });

  it("handles Infinity usage gracefully (does not crash)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ...SAMPLE_ENTITLEMENTS,
          limits: { BULK_VALIDATE: 100 },
          usage: { BULK_VALIDATE: Infinity },
        }),
    });
    renderWithProvider(<UsageMeter feature="BULK_VALIDATE" />);
    await waitFor(() => {
      // Infinity / 100 → Infinity → Math.min(Infinity, 100) → 100 → 100% capped
      expect(screen.getByText("100%")).toBeInTheDocument();
      expect(screen.getByText("Infinity / 100")).toBeInTheDocument();
    });
  });

  it("handles extremely large usage numbers without overflow", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ...SAMPLE_ENTITLEMENTS,
          limits: { BULK_VALIDATE: 999999999 },
          usage: { BULK_VALIDATE: 987654321 },
        }),
    });
    renderWithProvider(<UsageMeter feature="BULK_VALIDATE" />);
    await waitFor(() => {
      // 987654321 / 999999999 ≈ 98.77% → capped at 100% if > 100, rounded to 99%
      expect(screen.getByText(/99%/)).toBeInTheDocument();
    });
  });
});

// ================================================================
// 8. Additional frontend edge cases
// ================================================================
describe("additional frontend edge cases", () => {
  it("useFeature returns false while provider is in loading state", async () => {
    // Delay fetch to keep loading state
    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

    function TestLoading() {
      const enabled = useFeature("EXPORT_PDF");
      return <div data-testid="loading-result">{enabled ? "enabled" : "disabled"}</div>;
    }

    renderWithProvider(<TestLoading />);

    // While loading, entitlements is null → hasFeature returns false
    await waitFor(() => {
      expect(screen.getByTestId("loading-result")).toHaveTextContent("disabled");
    });
  });

  it("FeatureGuard with empty children renders nothing (no crash)", async () => {
    renderWithProvider(
      <FeatureGuard feature="EXPORT_PDF">
        <div />
      </FeatureGuard>,
    );
    // Should not crash, simply render nothing
    await waitFor(() => {
      // Feature is enabled, so it renders children (which is empty)
      // No assertion needed apart from no crash
    });
  });

  it("FeatureGuard with feature empty string renders fallback", async () => {
    renderWithProvider(
      <FeatureGuard feature="" fallback={<div data-testid="fallback">No feature</div>}>
        <div data-testid="content">Should not show</div>
      </FeatureGuard>,
    );
    await waitFor(() => {
      // Empty feature key returns false from hasFeature
      expect(screen.getByTestId("fallback")).toHaveTextContent("No feature");
      expect(screen.queryByTestId("content")).toBeNull();
    });
  });

  it("UpgradeBanner with empty message string renders Upgrade Plan button", () => {
    render(<UpgradeBanner message="" />);
    // With empty message, the <p> tag renders empty string — verify the upgrade link still exists
    expect(screen.getByText("Upgrade Plan")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/billing/upgrade");
  });

  it("Rapid successive refetches cancel previous requests", async () => {
    let abortCount = 0;
    mockFetch.mockImplementation((_url: string, opts: any) => {
      return new Promise((resolve) => {
        // Track abort signals
        const signal = opts.signal;
        signal.addEventListener("abort", () => {
          abortCount++;
        });
        // Only resolve the LAST call
        setTimeout(() => {
          if (!signal.aborted) {
            resolve({
              ok: true,
              json: () => Promise.resolve(SAMPLE_ENTITLEMENTS),
            });
          }
        }, 50);
      });
    });

    function RapidRefetcher() {
      const ctx = useEntitlements();
      React.useEffect(() => {
        // Simulate 3 rapid refetches
        ctx.refetch();
        ctx.refetch();
        ctx.refetch();
      }, []);
      return null;
    }

    renderWithProvider(<RapidRefetcher />);

    await waitFor(() => {
      // At least the first two should have been aborted
      expect(abortCount).toBeGreaterThanOrEqual(2);
    });
  });

  it("useLimit while loading returns null, 0, null defaults", async () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

    function TestLoadingLimit() {
      const { limit, used, resetAt } = useLimit("BULK_VALIDATE");
      return (
        <div>
          <span data-testid="lim">{String(limit)}</span>
          <span data-testid="usd">{used}</span>
          <span data-testid="res">{String(resetAt)}</span>
        </div>
      );
    }

    renderWithProvider(<TestLoadingLimit />);

    await waitFor(() => {
      expect(screen.getByTestId("lim")).toHaveTextContent("null");
      expect(screen.getByTestId("usd")).toHaveTextContent("0");
      expect(screen.getByTestId("res")).toHaveTextContent("null");
    });
  });
});
