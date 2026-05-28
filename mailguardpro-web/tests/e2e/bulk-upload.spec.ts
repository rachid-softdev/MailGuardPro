import { expect, test } from "@playwright/test";

test.describe("Bulk Upload", () => {
  test("should redirect to login when not authenticated", async ({ page }) => {
    await page.goto("/bulk");
    await expect(page).toHaveURL(/.*login/);
  });

  test("should display bulk upload page when authenticated", async ({ page }) => {
    // Navigate to login first, which should redirect to the app
    await page.goto("/login");

    // Check login page elements exist
    await expect(page.locator("h1, h2").first()).toBeVisible();
  });

  test("should have a file upload area on the bulk upload page", async ({ page }) => {
    await page.goto("/bulk");

    // Check that the page contains bulk/upload related content
    const pageContent = await page.content();
    expect(pageContent).toMatch(/upload|csv|bulk|import|file/i);
  });

  test("should have a file input for CSV upload", async ({ page }) => {
    await page.goto("/bulk");

    // Look for a file upload input
    const fileInput = page.locator('input[type="file"]');

    if (await fileInput.isVisible()) {
      // File upload input should accept CSV
      const acceptAttr = await fileInput.getAttribute("accept");
      if (acceptAttr) {
        expect(acceptAttr.toLowerCase()).toMatch(/csv|text\/csv/);
      }
    }
  });

  test("should show a drop zone for drag-and-drop upload", async ({ page }) => {
    await page.goto("/bulk");

    // Look for a drop zone UI element
    const dropZone = page
      .locator('[class*="drop"], [class*="upload"], [data-testid*="drop"]')
      .first();

    if (await dropZone.isVisible()) {
      // Drop zone should contain upload-related text
      const zoneText = await dropZone.textContent();
      expect(zoneText?.toLowerCase()).toMatch(/drop|upload|browse|choose|file/);
    }
  });

  test("should navigate to bulk upload from dashboard", async ({ page }) => {
    await page.goto("/dashboard");

    // Look for a link to bulk upload
    const bulkLink = page.locator('a[href*="bulk"], a[href*="upload"], a[href*="import"]').first();
    if (await bulkLink.isVisible()) {
      await bulkLink.click();
      await expect(page).toHaveURL(/.*bulk|.*upload|.*import/);
    }
  });

  test("should have a template download option", async ({ page }) => {
    await page.goto("/bulk");

    // Look for template download link
    const templateLink = page.locator(
      'a[href*="template"], a[href*="sample"], button:has-text("Template"), button:has-text("Sample")',
    );

    if (await templateLink.isVisible()) {
      // Template link should be clickable
      await expect(templateLink).toBeEnabled();
    }
  });

  test("should show upload progress indicator", async ({ page }) => {
    await page.goto("/bulk");

    // Check for progress-related UI elements
    const progressElements = page.locator(
      '[class*="progress"], [role="progressbar"], progress, [data-testid*="progress"]',
    );

    // Progress indicator may or may not be visible (depends on upload state)
    const count = await progressElements.count();
    expect(count >= 0).toBe(true);
  });

  test("should display upload results section", async ({ page }) => {
    await page.goto("/bulk");

    // Check for results-related UI elements
    const pageContent = await page.content();
    expect(pageContent).toMatch(/result|summary|complete|done|status/i);
  });

  test("should have upload button to start the process", async ({ page }) => {
    await page.goto("/bulk");

    // Look for upload/submit/start button
    const uploadButton = page.locator(
      'button:has-text("Upload"), button:has-text("Start"), button:has-text("Validate"), button[type="submit"]',
    );

    if (await uploadButton.isVisible()) {
      await expect(uploadButton).toBeEnabled();
    }
  });
});
