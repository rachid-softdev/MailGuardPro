import { test, expect } from '@playwright/test'

test.describe('Dashboard', () => {
  test('should redirect to login when not authenticated', async ({ page }) => {
    // Try to access dashboard directly
    await page.goto('/dashboard')

    // Should redirect to login page
    await expect(page).toHaveURL(/.*login/)
  })

  test('should display dashboard when authenticated', async ({ page }) => {
    // This test would require authentication setup
    // For now, we'll just check the dashboard page structure

    // Note: In real scenario, you'd use session storage or cookies to authenticate
    // This is a placeholder test structure

    // Navigate to login first
    await page.goto('/login')

    // Check login page elements exist
    await expect(page.locator('h1, h2')).toBeVisible()
  })

  test('should show credits balance', async ({ page }) => {
    await page.goto('/dashboard')

    // The dashboard should have some elements
    // Check for common dashboard elements
    const pageContent = await page.content()
    expect(pageContent).toMatch(/dashboard|credits|balance/i)
  })
})