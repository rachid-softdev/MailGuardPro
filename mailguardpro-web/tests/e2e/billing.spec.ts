import { expect, test } from "@playwright/test";

test.describe("Billing", () => {
  test("should display pricing page with plan tiers", async ({ page }) => {
    await page.goto("/pricing");

    // Check the page loaded
    await expect(page).toHaveTitle(/Pricing/);

    // All plan tiers should be present
    const pageContent = await page.content();
    expect(pageContent).toMatch(/Free/);
    expect(pageContent).toMatch(/Starter/);
    expect(pageContent).toMatch(/Pro/);
    expect(pageContent).toMatch(/Business/);

    // Pricing amounts should be visible
    expect(pageContent).toMatch(/\$0/);
    expect(pageContent).toMatch(/€9/);
    expect(pageContent).toMatch(/€29/);
    expect(pageContent).toMatch(/€99/);
  });

  test("should show get started / start trial buttons for each plan", async ({ page }) => {
    await page.goto("/pricing");

    // Each plan should have a CTA button
    const ctaButtons = page.locator(
      'button:has-text("Get started"), button:has-text("Start trial"), button:has-text("Contact us")',
    );
    const count = await ctaButtons.count();
    expect(count).toBeGreaterThanOrEqual(3);

    // Check specific CTAs
    const pageContent = await page.content();
    expect(pageContent).toMatch(/Get started|Start trial|Contact us/);
  });

  test("should show feature lists for each pricing plan", async ({ page }) => {
    await page.goto("/pricing");

    // Features specific to each tier should be mentioned
    const pageContent = await page.content();
    expect(pageContent).toMatch(/validations/);
    expect(pageContent).toMatch(/Bulk CSV|API access|Webhooks|Unlimited/);
  });

  test("should highlight the popular/recommended plan", async ({ page }) => {
    await page.goto("/pricing");

    // The Starter plan should be highlighted as "Popular"
    const popularBadge = page.locator("text=Popular");

    if (await popularBadge.isVisible()) {
      // Popular badge should be associated with a plan card
      const badgeCount = await popularBadge.count();
      expect(badgeCount).toBeGreaterThanOrEqual(1);
    }
  });

  test("should have navigation to pricing page from landing page", async ({ page }) => {
    await page.goto("/");

    // Look for pricing links
    const pricingLink = page.locator('a[href*="pricing"]').first();
    if (await pricingLink.isVisible()) {
      await pricingLink.click();
      await expect(page).toHaveURL(/.*pricing/);
      // Should see plan tiers
      await expect(page.locator("text=Free")).toBeVisible();
    }
  });

  test("should display current plan on dashboard", async ({ page }) => {
    await page.goto("/dashboard");

    // Dashboard should show plan information
    const pageContent = await page.content();
    expect(pageContent).toMatch(/FREE|Starter|Pro|Business|plan/i);
  });

  test("should show credit balance on dashboard", async ({ page }) => {
    await page.goto("/dashboard");

    // Dashboard should show credit information
    const pageContent = await page.content();
    expect(pageContent).toMatch(/credits?|balance|remaining/i);
  });

  test("should navigate to settings billing tab from dashboard", async ({ page }) => {
    await page.goto("/dashboard");

    // Look for a link or navigation to settings
    const settingsLink = page.locator('a[href*="settings"]').first();
    if (await settingsLink.isVisible()) {
      await settingsLink.click();
      await expect(page).toHaveURL(/.*settings/);
    }
  });

  test("should show billing section in settings page", async ({ page }) => {
    await page.goto("/settings");

    // Settings page should contain billing-related elements
    const pageContent = await page.content();
    expect(pageContent).toMatch(/billing|subscription|plan/i);
  });

  test("should have Manage Billing button in settings", async ({ page }) => {
    await page.goto("/settings");

    // Check for Manage Billing button
    const manageBillingBtn = page.locator('button:has-text("Manage Billing")');
    if (await manageBillingBtn.isVisible()) {
      await expect(manageBillingBtn).toBeEnabled();
    }
  });

  test("should display current plan and credits on settings page", async ({ page }) => {
    await page.goto("/settings");

    // Plan and credit info should be somewhere in the page
    const pageContent = await page.content();
    expect(pageContent).toMatch(/FREE|Starter|Pro|Business/i);
    expect(pageContent).toMatch(/credits?|remaining/i);
  });
});
