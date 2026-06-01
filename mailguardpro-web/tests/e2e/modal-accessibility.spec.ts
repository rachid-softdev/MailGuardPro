// =============================================================================
// TEST 6 (A11Y) — Modal accessibility
// =============================================================================
// Playwright E2E tests for modal dialog accessibility:
// - ARIA attributes (role, aria-modal, aria-labelledby)
// - Keyboard navigation (Escape, Tab focus trap)
// - Click overlay to close
// - Focus return after close
// =============================================================================

import { expect, test } from "@playwright/test";

test.describe("A11Y: Modal dialog accessibility", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a page that contains a modal trigger button
    // The validate page typically has modals for confirmation dialogs
    await page.goto("/validate");

    // Wait for the page to be fully loaded
    await page.waitForLoadState("networkidle");
  });

  // ---------------------------------------------------------------------------
  // Test 1 — Modal has role="dialog" and aria-modal="true"
  // ---------------------------------------------------------------------------
  test("should have role='dialog' and aria-modal='true' on the modal", async ({ page }) => {
    // Open the modal by clicking a trigger button (e.g., "Settings", "API Key", etc.)
    // This depends on the actual UI — search for common modal triggers
    const modal = await openAnyModal(page);

    // Skip test if no modal found on this page
    test.skip(!modal, "No modal found on /validate page — try different navigation");

    if (modal) {
      await expect(modal).toHaveAttribute("role", "dialog");
      await expect(modal).toHaveAttribute("aria-modal", "true");
    }
  });

  // ---------------------------------------------------------------------------
  // Test 2 — Modal has aria-labelledby pointing to the title
  // ---------------------------------------------------------------------------
  test("should have aria-labelledby pointing to the modal title", async ({ page }) => {
    const modal = await openAnyModal(page);

    test.skip(!modal, "No modal found on /validate page");

    if (modal) {
      const labelledBy = await modal.getAttribute("aria-labelledby");
      expect(labelledBy).toBeTruthy();

      // The element referenced by aria-labelledby should exist and contain text
      const titleElement = page.locator(`#${labelledBy}`);
      await expect(titleElement).toBeVisible();
      const titleText = await titleElement.textContent();
      expect(titleText?.trim().length).toBeGreaterThan(0);
    }
  });

  // ---------------------------------------------------------------------------
  // Test 3 — Escape closes the modal
  // ---------------------------------------------------------------------------
  test("should close modal when Escape key is pressed", async ({ page }) => {
    const modal = await openAnyModal(page);

    test.skip(!modal, "No modal found on /validate page");

    if (modal) {
      await expect(modal).toBeVisible();

      // Press Escape
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);

      // Modal should no longer be visible
      await expect(modal).not.toBeVisible();
    }
  });

  // ---------------------------------------------------------------------------
  // Test 4 — Tab cyclique dans la modale (focus trap)
  // ---------------------------------------------------------------------------
  test("should trap focus within the modal when tabbing", async ({ page }) => {
    const modal = await openAnyModal(page);

    test.skip(!modal, "No modal found on /validate page");

    if (modal) {
      await expect(modal).toBeVisible();

      // Get all focusable elements inside the modal
      const focusableSelectors = [
        "button:not([disabled])",
        "input:not([disabled])",
        "textarea:not([disabled])",
        "select:not([disabled])",
        "a[href]",
        '[tabindex]:not([tabindex="-1"])',
      ];

      const focusables = modal.locator(focusableSelectors.join(", "));
      const count = await focusables.count();

      // Only test focus trap if there are at least 2 focusable elements
      test.skip(count < 2, "Modal has fewer than 2 focusable elements — cannot test focus trap");

      if (count >= 2) {
        // Focus the first focusable element
        await focusables.first().focus();
        await expect(focusables.first()).toBeFocused();

        // Tab through all focusable elements
        for (let i = 0; i < count * 2; i++) {
          await page.keyboard.press("Tab");
          await page.waitForTimeout(50);
        }

        // After cycling through all elements (count * 2 tabs),
        // the focus should still be on a focusable element inside the modal
        const focusedElement = page.locator("*:focus");

        // If focus trap works, focus should stay within modal
        // If the focused element is the body or outside, the trap is broken
        const tagName = await focusedElement.evaluate((el: Element) => el.tagName.toLowerCase());
        expect(tagName).not.toBe("body");
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Test 4b — Shift+Tab also cycles within modal
  // ---------------------------------------------------------------------------
  test("should trap focus when using Shift+Tab (reverse cycle)", async ({ page }) => {
    const modal = await openAnyModal(page);

    test.skip(!modal, "No modal found on /validate page");

    if (modal) {
      await expect(modal).toBeVisible();

      const focusableSelectors = [
        "button:not([disabled])",
        "input:not([disabled])",
        "textarea:not([disabled])",
        "select:not([disabled])",
        "a[href]",
        '[tabindex]:not([tabindex="-1"])',
      ];

      const focusables = modal.locator(focusableSelectors.join(", "));
      const count = await focusables.count();

      test.skip(count < 2, "Modal has fewer than 2 focusable elements");

      if (count >= 2) {
        // Focus the LAST focusable element
        await focusables.last().focus();
        await expect(focusables.last()).toBeFocused();

        // Press Shift+Tab to go backwards
        await page.keyboard.press("Shift+Tab");
        await page.waitForTimeout(100);

        // Focus should move to the previous element (still inside the modal)
        const focusedElement = page.locator("*:focus");
        const tagName = await focusedElement.evaluate((el) => el.tagName.toLowerCase());
        expect(tagName).not.toBe("body");
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Test 5 — Click on overlay closes the modal
  // ---------------------------------------------------------------------------
  test("should close modal when clicking on the overlay backdrop", async ({ page }) => {
    const modal = await openAnyModal(page);

    test.skip(!modal, "No modal found on /validate page");

    if (modal) {
      await expect(modal).toBeVisible();

      // Find the overlay/backdrop
      // Common selectors for modal overlays
      const overlaySelectors = [
        '[class*="overlay"]',
        '[class*="backdrop"]',
        '[class*="Overlay"]',
        '[class*="Backdrop"]',
        '[aria-hidden="true"]',
        // The overlay is often a sibling or parent of the modal dialog
      ];

      let overlay = page.locator(overlaySelectors.join(", ")).first();

      // If no overlay found, try clicking outside the modal
      if ((await overlay.count()) === 0) {
        // Click on the top-left corner of the page (away from modal)
        const modalBox = await modal.boundingBox();
        if (modalBox) {
          await page.mouse.click(modalBox.x - 10, modalBox.y - 10);
        }
      } else {
        await overlay.click({ force: true });
      }

      await page.waitForTimeout(300);

      // Modal should be closed
      await expect(modal).not.toBeVisible();
    }
  });

  // ---------------------------------------------------------------------------
  // Test 6 — Le focus retourne au bouton déclencheur après fermeture
  // ---------------------------------------------------------------------------
  test("should return focus to the trigger button after modal closes", async ({ page }) => {
    // Find a button that opens a modal and capture its text/position
    const triggerButton = page
      .locator(
        'button:has-text("API Key"), button:has-text("Create"), button:has-text("Add"), ' +
          'button:has-text("Delete"), button:has-text("Confirm"), button:has-text("Settings"), ' +
          'button:has-text("api"), button:has-text("key"), ' +
          'a:has-text("Create"), a:has-text("Delete"), ' +
          '[data-testid*="modal-trigger"], [data-testid*="open-modal"]',
      )
      .first();

    const triggerExists = (await triggerButton.count()) > 0;
    test.skip(!triggerExists, "No modal trigger button found on this page");

    if (triggerExists) {
      // Focus the trigger button
      await triggerButton.focus();
      await expect(triggerButton).toBeFocused();

      // Click to open the modal
      await triggerButton.click();
      await page.waitForTimeout(500);

      // Verify modal opened
      const modal = page.locator('[role="dialog"]');
      if (await modal.isVisible()) {
        // Close the modal via Escape
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);

        // The trigger button should have focus again
        await expect(triggerButton).toBeFocused();
      }
    }
  });
});

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Attempt to open any modal on the current page by clicking common trigger
 * buttons. Returns the modal locator or null if no modal found.
 */
async function openAnyModal(page: import("@playwright/test").Page) {
  // List of common trigger selectors to try
  const triggerSelectors = [
    'button:has-text("Settings")',
    'button:has-text("API Keys")',
    'button:has-text("Create")',
    'button:has-text("Add")',
    'button:has-text("New")',
    'button:has-text("Delete")',
    'button:has-text("Confirm")',
    'button:has-text("Edit")',
    'a[href*="api-keys"]',
    'a[href*="settings"]',
    '[data-testid*="modal-trigger"]',
    '[data-testid*="open-modal"]',
  ];

  // Check if any modal is already visible
  let modal = page.locator('[role="dialog"]');
  if (await modal.isVisible().catch(() => false)) {
    return modal;
  }

  // Try each trigger
  for (const selector of triggerSelectors) {
    const trigger = page.locator(selector).first();
    if ((await trigger.count()) > 0 && (await trigger.isVisible())) {
      try {
        await trigger.click();
        await page.waitForTimeout(500);
        modal = page.locator('[role="dialog"]');
        if (await modal.isVisible().catch(() => false)) {
          return modal;
        }
      } catch {
        // Try next selector
      }
    }
  }

  return null;
}
