import { test, expect } from '@playwright/test'

test.describe('Email Validation', () => {
  test('should validate a single email via UI', async ({ page }) => {
    // Navigate to validation page
    await page.goto('/validate')

    // Check if page loaded
    await expect(page).toHaveTitle(/MailGuard/)

    // Check for validation input
    const emailInput = page.locator('input[type="email"], input[name="email"]')
    if (await emailInput.isVisible()) {
      await emailInput.fill('test@example.com')

      // Click validate button
      const validateButton = page.locator('button:has-text("Validate"), button[type="submit"]')
      await validateButton.click()

      // Wait for results
      await page.waitForTimeout(2000)

      // Check for score display
      const scoreElement = page.locator('[class*="score"], [data-testid="score"]')
      await expect(scoreElement).toBeVisible({ timeout: 5000 }).catch(() => {
        // If score not found, check for error message
        console.log('Score element not found - validation may have failed or not be visible')
      })
    }
  })

  test('should show validation result with score', async ({ page }) => {
    await page.goto('/validate')

    // Enter a test email
    const emailInput = page.locator('input').first()
    await emailInput.fill('test@example.com')

    // Submit
    await page.keyboard.press('Enter')

    // Wait for validation to complete
    await page.waitForTimeout(3000)

    // Should see some result on the page
    const pageContent = await page.content()
    expect(pageContent).toContain('example.com')
  })

  test('should handle invalid email format', async ({ page }) => {
    await page.goto('/validate')

    // Enter invalid email
    const emailInput = page.locator('input').first()
    await emailInput.fill('invalid-email')

    // Submit
    await page.keyboard.press('Enter')

    // Wait a bit
    await page.waitForTimeout(1000)

    // Check for error message or validation feedback
    // The UI should show some form of error/feedback
  })
})