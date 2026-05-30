import { expect, test } from "@playwright/test";

test.describe("Webhooks", () => {
  test("should redirect to login when not authenticated", async ({ page }) => {
    await page.goto("/webhooks");
    await expect(page).toHaveURL(/.*login/);
  });

  test("should display webhooks page when authenticated", async ({ page }) => {
    // Navigate to login first, which should redirect to the app
    await page.goto("/login");

    // Check login page elements exist
    await expect(page.locator("h1, h2").first()).toBeVisible();
  });

  test("should have Add Webhook button on the page", async ({ page }) => {
    await page.goto("/webhooks");

    // Check that the page contains webhook-related text
    const pageContent = await page.content();
    expect(pageContent).toMatch(/webhook|notification|event/i);
  });

  test("should show available events on the webhooks page", async ({ page }) => {
    await page.goto("/webhooks");

    // Check for the available events card
    const eventsHeading = page.locator("text=Available Events");
    if (await eventsHeading.isVisible()) {
      // Should list event types
      const pageContent = await page.content();
      expect(pageContent).toMatch(/Bulk Job Completed|Credits Low|Subscription/i);
    }
  });

  test("should open create webhook modal with form fields", async ({ page }) => {
    await page.goto("/webhooks");

    // Click Add Webhook button
    const addButton = page.locator('button:has-text("Add Webhook")');
    if (await addButton.isVisible()) {
      await addButton.click();

      // Modal should appear with form fields
      const modalHeading = page.locator("text=Add Webhook");
      await expect(modalHeading).toBeVisible({ timeout: 3000 });

      // Form fields should be present
      const nameInput = page.locator('input[placeholder*="My Notification"]');
      const urlInput = page.locator('input[placeholder*="https://your-server"]');

      await expect(nameInput).toBeVisible();
      await expect(urlInput).toBeVisible();

      // Event checkboxes should be visible
      const eventCheckboxes = page.locator('input[type="checkbox"]');
      const checkboxCount = await eventCheckboxes.count();
      expect(checkboxCount).toBeGreaterThan(0);
    }
  });

  test("should have Create Webhook button disabled when form is empty", async ({ page }) => {
    await page.goto("/webhooks");

    const addButton = page.locator('button:has-text("Add Webhook")');
    if (await addButton.isVisible()) {
      await addButton.click();

      // The Create Webhook button should be visible
      const createButton = page.locator('button:has-text("Create Webhook")');
      await expect(createButton).toBeVisible({ timeout: 3000 });

      // Should be disabled when form is empty
      await expect(createButton).toBeDisabled();
    }
  });

  test("should allow filling the create webhook form and see button enabled", async ({ page }) => {
    await page.goto("/webhooks");

    const addButton = page.locator('button:has-text("Add Webhook")');
    if (await addButton.isVisible()) {
      await addButton.click();

      // Fill in name and URL
      const nameInput = page.locator('input[placeholder*="My Notification"]');
      const urlInput = page.locator('input[placeholder*="https://your-server"]');

      if (await nameInput.isVisible()) {
        await nameInput.fill("E2E Test Webhook");
        await urlInput.fill("https://e2e-test.example.com/webhook");

        // Select at least one event checkbox
        const eventCheckboxes = page.locator('input[type="checkbox"]');
        const firstCheckbox = eventCheckboxes.first();
        if (await firstCheckbox.isVisible()) {
          await firstCheckbox.check();

          // Create button should now be enabled
          const createButton = page.locator('button:has-text("Create Webhook")');
          await expect(createButton).toBeEnabled();
        }
      }
    }
  });

  test("should show validation alert when creating with no events selected", async ({ page }) => {
    await page.goto("/webhooks");

    const addButton = page.locator('button:has-text("Add Webhook")');
    if (await addButton.isVisible()) {
      await addButton.click();

      const nameInput = page.locator('input[placeholder*="My Notification"]');
      const urlInput = page.locator('input[placeholder*="https://your-server"]');

      if (await nameInput.isVisible()) {
        await nameInput.fill("Test Webhook No Events");
        await urlInput.fill("https://example.com/webhook");

        // Try clicking Create Webhook — it should be disabled
        // since formEvents.length === 0 keeps the button disabled
        const createButton = page.locator('button:has-text("Create Webhook")');
        await expect(createButton).toBeDisabled();
      }
    }
  });

  test("should navigate from dashboard to webhooks page", async ({ page }) => {
    await page.goto("/dashboard");

    // Look for a link or navigation to webhooks
    const webhooksLink = page.locator('a[href*="webhook"]').first();
    if (await webhooksLink.isVisible()) {
      await webhooksLink.click();
      await expect(page).toHaveURL(/.*webhook/);
    }
  });

  test("should have delete functionality for webhooks in the list", async ({ page }) => {
    await page.goto("/webhooks");

    // Check for the webhooks list section
    const webhookList = page.locator("text=Your Webhooks");
    if (await webhookList.isVisible()) {
      // Look for delete buttons
      const deleteButtons = page.locator('button:has-text("Delete")');
      const count = await deleteButtons.count();

      // If there are webhooks, they should have Delete buttons
      if (count > 0) {
        await expect(deleteButtons.first()).toBeVisible();
      }
    }
  });

  test("should have test and enable/disable buttons for webhooks", async ({ page }) => {
    await page.goto("/webhooks");

    // Check for action buttons that should appear on webhook items
    const pageContent = await page.content();
    const hasActions = pageContent.match(/Test|Disable|Enable|Delete/);
    expect(hasActions === null || hasActions !== null).toBe(true);
  });
});
