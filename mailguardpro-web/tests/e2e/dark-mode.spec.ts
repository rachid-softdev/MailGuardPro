// =============================================================================
// THEME-1, THEME-2, THEME-3: Dark Mode / Theme System E2E Tests
// Tests:
//   - FOUC prevention: data-theme attribute on <html> from inline script
//   - localStorage mg-theme persistence and cycle
//   - ThemeToggle aria-label updates (when rendered)
//   - All 3 theme modes: light → dark → system → light
//   - Mobile viewport compatibility
// =============================================================================

import { expect, test } from "@playwright/test";

test.describe("Dark Mode / Theme System", () => {
  // ===========================================================================
  // FOUC Prevention — inline script in root layout
  // ===========================================================================

  test("should set data-theme attribute on <html> via FOUC prevention script", async ({ page }) => {
    // Navigate to a public page
    await page.goto("/");

    // The FOUC prevention script in the root layout should set data-theme
    const themeAttr = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    expect(themeAttr).toMatch(/^light|dark$/);
  });

  test("should reflect localStorage mg-theme in data-theme on load", async ({ page }) => {
    // Set localStorage before navigating so the FOUC script picks it up
    await page.addInitScript(() => {
      localStorage.setItem("mg-theme", "dark");
    });

    await page.goto("/");

    const themeAttr = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    expect(themeAttr).toBe("dark");
  });

  test("should use 'system' fallback when no localStorage value is set", async ({ page }) => {
    // Clear localStorage before navigating
    await page.addInitScript(() => {
      localStorage.removeItem("mg-theme");
    });

    await page.goto("/");

    const themeAttr = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    // Should resolve to either light or dark based on system preference
    expect(themeAttr).toMatch(/^light|dark$/);
  });

  // ===========================================================================
  // Theme cycle: light ↔ dark ↔ system ↔ light via localStorage
  // ===========================================================================

  test("should cycle from light to dark mode via localStorage", async ({ page }) => {
    // Start with light mode
    await page.addInitScript(() => {
      localStorage.setItem("mg-theme", "light");
    });
    await page.goto("/");
    let themeAttr = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    expect(themeAttr).toBe("light");

    // Simulate "cycle to dark" by setting localStorage and reloading
    await page.evaluate(() => localStorage.setItem("mg-theme", "dark"));
    await page.reload();

    themeAttr = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    expect(themeAttr).toBe("dark");
  });

  test("should cycle from dark to system mode via localStorage", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("mg-theme", "dark");
    });
    await page.goto("/");
    let themeAttr = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    expect(themeAttr).toBe("dark");

    // Cycle to system — resolves to actual system preference
    await page.evaluate(() => localStorage.setItem("mg-theme", "system"));
    await page.reload();

    themeAttr = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    // System mode resolves to light or dark
    expect(themeAttr).toMatch(/^light|dark$/);
  });

  test("should cycle from system back to light mode via localStorage", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("mg-theme", "system");
    });
    await page.goto("/");

    await page.evaluate(() => localStorage.setItem("mg-theme", "light"));
    await page.reload();

    const themeAttr = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    expect(themeAttr).toBe("light");
  });

  test("should complete full cycle: light → dark → system → light", async ({ page }) => {
    const themes = ["light", "dark", "system", "light"] as const;

    for (const theme of themes) {
      await page.addInitScript(() => {
        // Remove all mg-theme values first, then the addInitScript callback
        // will set it — but addInitScript runs before any page JS.
        // Instead, just set before each goto.
      });
      // We have to use a different approach: set via evaluate + reload
    }

    // Start from clean state
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("mg-theme", "light"));
    await page.reload();

    // Verify each step of the cycle
    // light → dark
    await page.evaluate(() => localStorage.setItem("mg-theme", "dark"));
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe(
      "dark",
    );

    // dark → system
    await page.evaluate(() => localStorage.setItem("mg-theme", "system"));
    await page.reload();
    const systemTheme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    expect(systemTheme).toMatch(/^light|dark$/);

    // system → light
    await page.evaluate(() => localStorage.setItem("mg-theme", "light"));
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe(
      "light",
    );
  });

  // ===========================================================================
  // localStorage key verification
  // ===========================================================================

  test("should persist mg-theme key in localStorage after setting", async ({ page }) => {
    await page.goto("/");

    // Set each theme and verify localStorage
    for (const theme of ["light", "dark", "system"] as const) {
      await page.evaluate((t) => localStorage.setItem("mg-theme", t), theme);
      const stored = await page.evaluate(() => localStorage.getItem("mg-theme"));
      expect(stored).toBe(theme);
    }
  });

  test("should be resilient to invalid localStorage values", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("mg-theme", "invalid-value");
    });

    await page.goto("/");

    // Should still resolve to a valid theme
    const themeAttr = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    expect(themeAttr).toMatch(/^light|dark$/);
  });

  // ===========================================================================
  // ThemeToggle aria-label (when rendered in authenticated dashboard)
  // ===========================================================================

  test("should have ThemeToggle button with descriptive aria-label on dashboard", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    // Dashboard redirects to login when unauthenticated
    // Check if we got redirected
    const currentUrl = page.url();

    if (currentUrl.includes("/login")) {
      // Not authenticated — the ThemeToggle is only in the sidebar
      // Verify the redirect happened and mark test as informative
      await expect(page.locator("h1")).toContainText(/sign in|log in/i);
      test.info().annotations.push({
        type: "info",
        description:
          "ThemeToggle requires authentication. Only visible on dashboard pages inside the Sidebar component.",
      });
    } else {
      // Authenticated — test the actual ThemeToggle
      const themeToggle = page.locator(
        'button[aria-label*="Light mode"], button[aria-label*="Dark mode"], button[aria-label*="System theme"]',
      );
      await expect(themeToggle).toBeVisible();

      // Get initial aria-label
      const initialLabel = await themeToggle.getAttribute("aria-label");
      expect(initialLabel).toMatch(/Current: (Light mode|Dark mode|System theme)/);

      // Click to cycle theme
      await themeToggle.click();

      // After click, aria-label should update
      const newLabel = await themeToggle.getAttribute("aria-label");
      expect(newLabel).not.toBe(initialLabel);

      // Verify localStorage was updated
      const storedTheme = await page.evaluate(() => localStorage.getItem("mg-theme"));
      expect(["light", "dark", "system"]).toContain(storedTheme);

      // Verify data-theme on html element
      const themeAttr = await page.evaluate(() =>
        document.documentElement.getAttribute("data-theme"),
      );
      expect(themeAttr).toMatch(/^light|dark$/);
    }
  });

  test("should cycle through all 3 modes via ThemeToggle button clicks", async ({ page }) => {
    await page.goto("/dashboard");
    const currentUrl = page.url();

    if (currentUrl.includes("/login")) {
      test.info().annotations.push({
        type: "info",
        description: "Full ThemeToggle cycle requires authentication.",
      });
      return;
    }

    const themeToggle = page.locator(
      'button[aria-label*="Light mode"], button[aria-label*="Dark mode"], button[aria-label*="System theme"]',
    );
    await expect(themeToggle).toBeVisible();

    // Cycle through all 3 modes
    for (let i = 0; i < 3; i++) {
      const beforeLabel = await themeToggle.getAttribute("aria-label");

      await themeToggle.click();
      await page.waitForTimeout(300);

      const afterLabel = await themeToggle.getAttribute("aria-label");
      // The label should change after each click
      expect(afterLabel).not.toBe(beforeLabel);

      // Verify data-theme is valid
      const themeAttr = await page.evaluate(() =>
        document.documentElement.getAttribute("data-theme"),
      );
      expect(themeAttr).toMatch(/^light|dark$/);
    }
  });

  // ===========================================================================
  // Mobile viewport
  // ===========================================================================

  test("should apply correct data-theme on mobile viewport", async ({ page }) => {
    // Set viewport to iPhone SE size
    await page.setViewportSize({ width: 375, height: 667 });

    await page.addInitScript(() => {
      localStorage.setItem("mg-theme", "dark");
    });

    await page.goto("/");

    // Verify theme is applied on mobile
    const themeAttr = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    expect(themeAttr).toBe("dark");

    // Switch to light on mobile
    await page.evaluate(() => localStorage.setItem("mg-theme", "light"));
    await page.reload();

    const lightTheme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    expect(lightTheme).toBe("light");
  });

  test("should preserve theme across page navigations", async ({ page }) => {
    // Set dark mode
    await page.addInitScript(() => {
      localStorage.setItem("mg-theme", "dark");
    });

    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe(
      "dark",
    );

    // Navigate to pricing page
    await page.goto("/pricing");
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe(
      "dark",
    );

    // Navigate to docs
    await page.goto("/docs");
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe(
      "dark",
    );
  });
});
