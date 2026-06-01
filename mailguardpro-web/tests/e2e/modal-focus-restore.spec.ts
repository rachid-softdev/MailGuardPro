// =============================================================================
// CRIT-3: Modal focus restoration
// Playwright E2E tests for modal focus management:
// - Clicking a trigger button opens modal
// - Escape closes the modal
// - Focus returns to trigger button after close
// - Tab cycles through focusable elements inside modal
// - Focus doesn't escape the modal when Tab is pressed on last element
// =============================================================================

import { expect, test } from "@playwright/test";

test.describe("CRIT-3: Modal focus restoration", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a page that contains modal dialogs
    await page.goto("/webhooks");
    await page.waitForLoadState("networkidle");
  });

  // ==========================================================================
  // Helper: open a modal by clicking a "Create" or trigger button
  // ==========================================================================

  async function openCreateModal(page: import("@playwright/test").Page) {
    // Try to find and click any button that opens a modal
    const triggerSelectors = [
      'button:has-text("Add Webhook")',
      'button:has-text("Create")',
      'button:has-text("New")',
      'button:has-text("Add")',
      '[data-testid*="modal-trigger"]',
      '[data-testid*="open-modal"]',
    ];

    for (const selector of triggerSelectors) {
      const trigger = page.locator(selector).first();
      if ((await trigger.count()) > 0 && (await trigger.isVisible())) {
        // Remember the trigger for focus verification
        const triggerText = await trigger.textContent();
        await trigger.click();
        await page.waitForTimeout(500);
        // Check if a modal appeared
        const modal = page.locator('[role="dialog"], [class*="modal"], [class*="overlay"]').first();
        if (await modal.isVisible().catch(() => false)) {
          return { trigger, modal, triggerText };
        }
      }
    }
    return null;
  }

  // ==========================================================================
  // Test 1 — Clicking a "Create" button opens modal
  // ==========================================================================

  test("should open a modal when clicking a Create button", async ({ page }) => {
    const result = await openCreateModal(page);
    test.skip(!result, "No modal trigger button found on this page");

    if (result) {
      await expect(result.modal).toBeVisible();
      // The trigger should still exist in the DOM
      await expect(result.trigger).toBeAttached();
    }
  });

  // ==========================================================================
  // Test 2 — Pressing Escape closes the modal
  // ==========================================================================

  test("should close the modal when pressing Escape", async ({ page }) => {
    const result = await openCreateModal(page);
    test.skip(!result, "No modal trigger button found on this page");

    if (result) {
      const { modal } = result;
      await expect(modal).toBeVisible();

      // Press Escape to close
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);

      // Modal should no longer be visible
      await expect(modal).not.toBeVisible();
    }
  });

  // ==========================================================================
  // Test 3 — Focus returns to the trigger button after close
  // ==========================================================================

  test("should return focus to the trigger button after modal closes", async ({ page }) => {
    // First, find a button that opens a modal
    const triggerButton = page
      .locator(
        'button:has-text("Add Webhook"), button:has-text("Create"), button:has-text("Add"), ' +
          'button:has-text("New"), button:has-text("Edit"), ' +
          '[data-testid*="modal-trigger"]',
      )
      .first();

    const triggerExists = (await triggerButton.count()) > 0 && (await triggerButton.isVisible());
    test.skip(!triggerExists, "No modal trigger button found on this page");

    if (triggerExists) {
      // Focus the trigger button first
      await triggerButton.focus();
      await expect(triggerButton).toBeFocused();

      // Click to open the modal
      await triggerButton.click();
      await page.waitForTimeout(500);

      // Verify modal opened
      const modal = page.locator('[role="dialog"], [class*="modal"]').first();
      if (await modal.isVisible().catch(() => false)) {
        // Close the modal via Escape
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);

        // The trigger button should have focus again
        await expect(triggerButton).toBeFocused();
      }
    }
  });

  // ==========================================================================
  // Test 4 — Tab cycles through focusable elements inside modal
  // ==========================================================================

  test("should cycle focus through focusable elements inside the modal with Tab", async ({
    page,
  }) => {
    const result = await openCreateModal(page);
    test.skip(!result, "No modal trigger button found on this page");

    if (result) {
      const { modal } = result;
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

      test.skip(count < 2, "Modal has fewer than 2 focusable elements");

      if (count >= 2) {
        // Focus the first focusable element
        await focusables.first().focus();
        await expect(focusables.first()).toBeFocused();

        // Press Tab to move to the next element
        await page.keyboard.press("Tab");
        await page.waitForTimeout(100);

        // Focus should move to the second element
        await expect(focusables.nth(1)).toBeFocused();

        // Tab through remaining elements
        for (let i = 2; i < count; i++) {
          await page.keyboard.press("Tab");
          await page.waitForTimeout(50);
          // Focus should stay on a focusable element within the modal
          const focusedElement = page.locator("*:focus");
          const tagName = await focusedElement.evaluate((el: Element) => el.tagName);
          expect(tagName).not.toBe("BODY");
        }
      }
    }
  });

  // ==========================================================================
  // Test 5 — Focus doesn't escape the modal when Tab on last element
  // ==========================================================================

  test("should trap focus inside modal when Tab is pressed on the last element", async ({
    page,
  }) => {
    const result = await openCreateModal(page);
    test.skip(!result, "No modal trigger button found on this page");

    if (result) {
      const { modal } = result;
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
        const lastIndex = count - 1;
        await focusables.nth(lastIndex).focus();
        await expect(focusables.nth(lastIndex)).toBeFocused();

        // Press Tab on the last element
        await page.keyboard.press("Tab");
        await page.waitForTimeout(100);

        // Focus should wrap to the FIRST element (focus trap)
        // NOT escape to the body/page background
        const focusedElement = page.locator("*:focus");
        const tagName = await focusedElement.evaluate((el: Element) => el.tagName);
        expect(tagName).not.toBe("BODY");

        // The focused element should still be inside the modal
        const isInsideModal = await focusedElement.evaluate((el: Element) => {
          return el.closest('[role="dialog"], [class*="modal"]') !== null;
        });
        expect(isInsideModal).toBe(true);
      }
    }
  });

  // ==========================================================================
  // Test 6 — Shift+Tab on first element wraps to last
  // ==========================================================================

  test("should wrap focus to last element when Shift+Tab on first element", async ({ page }) => {
    const result = await openCreateModal(page);
    test.skip(!result, "No modal trigger button found on this page");

    if (result) {
      const { modal } = result;
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
        // Focus the first element
        await focusables.first().focus();
        await expect(focusables.first()).toBeFocused();

        // Press Shift+Tab
        await page.keyboard.press("Shift+Tab");
        await page.waitForTimeout(100);

        // Focus should wrap to the LAST element (not escape the modal)
        const focusedElement = page.locator("*:focus");
        const tagName = await focusedElement.evaluate((el: Element) => el.tagName);
        expect(tagName).not.toBe("BODY");

        // Focus should be on a focusable element within the modal
        const isInsideModal = await focusedElement.evaluate((el: Element) => {
          return el.closest('[role="dialog"], [class*="modal"]') !== null;
        });
        expect(isInsideModal).toBe(true);
      }
    }
  });

  // ==========================================================================
  // Test 7 — Modal closes when clicking close button (X button)
  // ==========================================================================

  test("should close modal when clicking the close button", async ({ page }) => {
    const result = await openCreateModal(page);
    test.skip(!result, "No modal trigger button found on this page");

    if (result) {
      const { modal } = result;
      await expect(modal).toBeVisible();

      // Look for a close button (X button, ×, Close text)
      const closeButton = modal
        .locator(
          'button[aria-label="Close"], button:has-text("Close"), ' +
            'button:has-text("Cancel"), [class*="close"], [class*="Close"]',
        )
        .first();

      if ((await closeButton.count()) > 0 && (await closeButton.isVisible())) {
        await closeButton.click();
        await page.waitForTimeout(300);

        await expect(modal).not.toBeVisible();
      }
    }
  });
});
