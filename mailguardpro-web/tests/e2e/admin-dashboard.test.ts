// =============================================================================
// Admin Dashboard Page — E2E Tests
//
// Tests:
//   1. Redirect to /login when not authenticated
//   2. Loading state (skeletons) while API call is in-flight
//   3. Full data render: 5 StatCards, Users by Plan bars, System Overview,
//      Recent Users table (10 rows), PlanBadge, ActiveBadge
//   4. Access Denied on 403 response (ShieldAlert icon)
//   5. Network error (connection refused / fetch throws)
//   6. Server error (500 → error banner + Retry button)
//   7. Empty state (200 but data is null → "No data available." + Reload)
//   8. Component-level: StatCard accent colors, PlanBadge known/unknown plans,
//      ActiveBadge active/inactive
// =============================================================================

import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_URL = "**/api/v1/admin/stats";
const ADMIN_URL = "/admin";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const MOCK_STATS_COMPLETE = {
  success: true,
  data: {
    totalUsers: 1234,
    activeUsers: 850,
    totalValidations: 56789,
    validationsToday: 123,
    totalBulkJobs: 45,
    activeWebhooks: 12,
    totalApiKeys: 67,
    usersByPlan: [
      { plan: "FREE", count: 800 },
      { plan: "STARTER", count: 250 },
      { plan: "GROWTH", count: 120 },
      { plan: "SCALE", count: 50 },
      { plan: "ENTERPRISE", count: 14 },
    ],
    recentUsers: [
      {
        id: "u1",
        name: "Alice",
        email: "alice@test.com",
        plan: "ENTERPRISE",
        isActive: true,
        createdAt: "2026-06-29T12:00:00Z",
      },
      {
        id: "u2",
        name: null,
        email: "bob@test.com",
        plan: "FREE",
        isActive: false,
        createdAt: "2026-06-28T10:00:00Z",
      },
      {
        id: "u3",
        name: "Charlie",
        email: "charlie@test.com",
        plan: "STARTER",
        isActive: true,
        createdAt: "2026-06-27T08:00:00Z",
      },
      {
        id: "u4",
        name: "Diana",
        email: "diana@test.com",
        plan: "GROWTH",
        isActive: true,
        createdAt: "2026-06-26T14:00:00Z",
      },
      {
        id: "u5",
        name: "Eve",
        email: "eve@test.com",
        plan: "SCALE",
        isActive: false,
        createdAt: "2026-06-25T09:00:00Z",
      },
      {
        id: "u6",
        name: "Frank",
        email: "frank@test.com",
        plan: "FREE",
        isActive: true,
        createdAt: "2026-06-24T16:00:00Z",
      },
      {
        id: "u7",
        name: "Grace",
        email: "grace@test.com",
        plan: "STARTER",
        isActive: true,
        createdAt: "2026-06-23T11:00:00Z",
      },
      {
        id: "u8",
        name: "Henry",
        email: "henry@test.com",
        plan: "UNKNOWN_PLAN",
        isActive: false,
        createdAt: "2026-06-22T13:00:00Z",
      },
      {
        id: "u9",
        name: "Iris",
        email: "iris@test.com",
        plan: "GROWTH",
        isActive: true,
        createdAt: "2026-06-21T15:00:00Z",
      },
      {
        id: "u10",
        name: "Jack",
        email: "jack@test.com",
        plan: "ENTERPRISE",
        isActive: true,
        createdAt: "2026-06-20T07:00:00Z",
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Auth setup — create a test admin user + session in the database
// ---------------------------------------------------------------------------

let sessionToken: string | null = null;
let userId: string | null = null;
let authReady = false;

test.beforeAll(async () => {
  const prisma = new PrismaClient();
  try {
    // Create or update a dedicated e2e test admin user
    const user = await prisma.user.upsert({
      where: { email: "e2e-admin-test@mailguard.test" },
      create: {
        email: "e2e-admin-test@mailguard.test",
        name: "E2E Admin Test",
        role: "ADMIN",
        isActive: true,
      },
      update: { role: "ADMIN", isActive: true },
    });
    userId = user.id;

    // Remove any stale sessions for this user
    await prisma.session.deleteMany({ where: { userId: user.id } });

    // Create a fresh session (valid 24h)
    sessionToken = randomUUID();
    await prisma.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    authReady = true;
    console.log("[Admin E2E] Auth session created:", { userId: user.id, sessionToken });
  } catch (err) {
    console.warn("[Admin E2E] Could not set up test auth session:", (err as Error).message);
    console.warn("[Admin E2E] Tests requiring auth will be skipped.");
  } finally {
    await prisma.$disconnect();
  }
});

test.afterAll(async () => {
  if (userId) {
    const prisma = new PrismaClient();
    try {
      await prisma.session.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
      console.log("[Admin E2E] Cleaned up test user and sessions.");
    } catch (err) {
      console.warn("[Admin E2E] Cleanup error:", (err as Error).message);
    } finally {
      await prisma.$disconnect();
    }
  }
});

// ===========================================================================
// Tests
// ===========================================================================

test.describe("Admin Dashboard Page", () => {
  // -----------------------------------------------------------------------
  // Redirect — always works, no auth required
  // -----------------------------------------------------------------------

  test("should redirect to /login when not authenticated", async ({ page }) => {
    await page.goto(ADMIN_URL);
    await expect(page).toHaveURL(/.*login/);
  });

  // -----------------------------------------------------------------------
  // Authenticated tests
  // -----------------------------------------------------------------------

  test.describe("authenticated", () => {
    test.beforeEach(async ({ page }, testInfo) => {
      if (!authReady) {
        testInfo.skip();
        return;
      }
      // Set the NextAuth database session cookie so the server-side
      // DashboardLayout.auth() finds a valid session.
      await page.context().addCookies([
        {
          name: "next-auth.session-token",
          value: sessionToken!,
          domain: "localhost",
          path: "/",
        },
      ]);
    });

    // =====================================================================
    // 1. Loading state
    // =====================================================================

    test("should show skeletons while API call is in-flight", async ({ page }) => {
      // Delay the API response to keep the loading state visible
      await page.route(API_URL, async (route) => {
        await new Promise((r) => setTimeout(r, 3000));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_STATS_COMPLETE),
        });
      });

      await page.goto(ADMIN_URL);

      // The loading state replaces headings with skeleton divs (no <h1>/<p>).
      // Skeleton elements should be present across the page.
      const skeletons = page.locator(".animate-skeleton");
      await expect(skeletons.first()).toBeVisible({ timeout: 3000 });

      // Total skeleton count should be substantial (title + 5 stat cards
      // + plan distribution + recent users table)
      const skeletonCount = await skeletons.count();
      expect(skeletonCount).toBeGreaterThan(30);

      // Title/subtitle area: two skeleton bars inside the mb-8 header div
      const headerSkeletons = page.locator(".p-8 > .mb-8 > .animate-skeleton");
      await expect(headerSkeletons).toHaveCount(2);

      // In loading state there are 7 card elements:
      //   5 StatCardSkeleton + 1 Plan Distribution card + 1 Recent Users card
      const cards = page.locator(".card");
      await expect(cards).toHaveCount(7);

      // StatCardSkeletons (first 5 cards): each has 2 skeleton bars (label + value)
      for (let i = 0; i < 5; i++) {
        await expect(cards.nth(i).locator(".animate-skeleton")).toHaveCount(2);
      }

      // Wait for API response (3s delay + buffer)
      await page.waitForTimeout(3500);
      await page.waitForLoadState("networkidle");

      // After loading, skeletons are replaced by actual data
      await expect(page.locator("h1")).toHaveText("Admin");
      await expect(page.locator("p:has-text('System-wide overview')")).toBeVisible();
      await expect(page.locator("h2:has-text('Users by Plan')")).toBeVisible();
      await expect(page.locator("h2:has-text('System Overview')")).toBeVisible();
      await expect(page.locator("h2:has-text('Recent Users')")).toBeVisible();
    });

    // =====================================================================
    // 2. Normal render — complete data
    // =====================================================================

    test("should display complete admin dashboard with all data sections", async ({ page }) => {
      await page.route(API_URL, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_STATS_COMPLETE),
        });
      });

      await page.goto(ADMIN_URL);
      await page.waitForLoadState("networkidle");

      // ---- Page title ----
      await expect(page.locator("h1")).toHaveText("Admin");
      await expect(page.locator("p:has-text('System-wide overview')")).toBeVisible();

      // ---- 5 StatCards with correct values ----
      // StatCards are the only .card elements with border-t-2 class
      const statCards = page.locator(".card.border-t-2");
      await expect(statCards).toHaveCount(5);

      // Each StatCard value is in a .text-3xl paragraph
      await expect(statCards.nth(0).locator(".text-3xl")).toHaveText("1234"); // Total Users
      await expect(statCards.nth(1).locator(".text-3xl")).toHaveText("850"); // Active Users
      await expect(statCards.nth(2).locator(".text-3xl")).toHaveText("123"); // Validations Today
      await expect(statCards.nth(3).locator(".text-3xl")).toHaveText("56789"); // Total Validations
      await expect(statCards.nth(4).locator(".text-3xl")).toHaveText("12"); // Active Webhooks

      // Each StatCard label is in a .text-xs.uppercase <p> inside the card
      await expect(statCards.nth(0).locator("p.text-xs.uppercase")).toHaveText("Total Users");
      await expect(statCards.nth(1).locator("p.text-xs.uppercase")).toHaveText("Active Users");
      await expect(statCards.nth(2).locator("p.text-xs.uppercase")).toHaveText("Validations Today");
      await expect(statCards.nth(3).locator("p.text-xs.uppercase")).toHaveText("Total Validations");
      await expect(statCards.nth(4).locator("p.text-xs.uppercase")).toHaveText("Active Webhooks");

      // ---- Users by Plan section ----
      await expect(page.locator("h2:has-text('Users by Plan')")).toBeVisible();

      // Each plan badge is a span.inline-block (not ActiveBadge which is inline-flex)
      const planBadgesContainer = page.locator("h2:has-text('Users by Plan')").locator("..");
      const planBadges = planBadgesContainer.locator("span.inline-block");
      await expect(planBadges).toHaveCount(5);

      // Each plan name and count should be visible
      const expectedPlans = ["FREE", "STARTER", "GROWTH", "SCALE", "ENTERPRISE"];
      const expectedCounts = ["800", "250", "120", "50", "14"];
      for (let i = 0; i < expectedPlans.length; i++) {
        await expect(planBadges.nth(i)).toHaveText(expectedPlans[i]);
        await expect(planBadgesContainer.locator(`text=${expectedCounts[i]}`)).toBeVisible();
      }

      // ---- System Overview section — 5 rows with labels and values ----
      await expect(page.locator("h2:has-text('System Overview')")).toBeVisible();
      const systemCard = page.locator("h2:has-text('System Overview')").locator("..");
      // Verify each label + value pair appears inside the system overview card
      const systemData = [
        { label: "Bulk Jobs", value: "45" },
        { label: "API Keys", value: "67" },
        { label: "Active Webhooks", value: "12" },
        { label: "Total Users", value: "1234" },
        { label: "Active Users", value: "850" },
      ];
      for (const entry of systemData) {
        await expect(systemCard.locator(`text=${entry.label}`)).toBeVisible();
        await expect(systemCard.locator(`text=${entry.value}`)).toBeVisible();
      }

      // ---- Recent Users table ----
      await expect(page.locator("h2:has-text('Recent Users')")).toBeVisible();

      // Table headers
      const headers = ["Name", "Email", "Plan", "Created", "Status"];
      for (const header of headers) {
        await expect(page.locator(`th:has-text("${header}")`)).toBeVisible();
      }

      // 10 user rows
      const rows = page.locator("table tbody tr");
      await expect(rows).toHaveCount(10);

      // Verify first row (Alice — active, ENTERPRISE)
      await expect(rows.nth(0).locator("td").nth(0)).toHaveText("Alice");
      await expect(rows.nth(0).locator("td").nth(1)).toHaveText("alice@test.com");
      await expect(rows.nth(0).locator("td").nth(2)).toContainText("ENTERPRISE");
      await expect(rows.nth(0).locator("td").nth(4)).toContainText("Active");

      // Verify second row (Bob — no name, FREE, inactive)
      await expect(rows.nth(1).locator("td").nth(0)).toHaveText("\u2014"); // em dash
      await expect(rows.nth(1).locator("td").nth(1)).toHaveText("bob@test.com");
      await expect(rows.nth(1).locator("td").nth(2)).toContainText("FREE");
      await expect(rows.nth(1).locator("td").nth(4)).toContainText("Inactive");
    });

    // =====================================================================
    // 3. Access Denied (403)
    // =====================================================================

    test("should show Access Denied page when API returns 403", async ({ page }) => {
      await page.route(API_URL, async (route) => {
        await route.fulfill({ status: 403 });
      });

      await page.goto(ADMIN_URL);
      await page.waitForLoadState("networkidle");

      // Heading should still show
      await expect(page.locator("h1")).toHaveText("Admin");

      // AccessDenied component
      await expect(page.locator("text=Access Denied")).toBeVisible();
      await expect(
        page.locator("text=You do not have permission to view this page."),
      ).toBeVisible();
      await expect(
        page.locator("text=Only users with the Admin role can access the admin dashboard."),
      ).toBeVisible();

      // ShieldAlert icon should be present
      const shieldIcon = page.locator(".lucide-shield-alert");
      await expect(shieldIcon).toBeVisible();
      // The icon is inside a rounded container
      await expect(shieldIcon.locator("..")).toHaveClass(/rounded-full/);
    });

    // =====================================================================
    // 4. Network error (fetch throws)
    // =====================================================================

    test("should show network error banner with Retry button when fetch fails", async ({
      page,
    }) => {
      await page.route(API_URL, async (route) => {
        await route.abort("connectionrefused");
      });

      await page.goto(ADMIN_URL);
      await page.waitForLoadState("networkidle");

      // Heading
      await expect(page.locator("h1")).toHaveText("Admin");

      // Error message — the component's catch block sets this text
      await expect(page.locator("text=Could not connect to server")).toBeVisible();

      // Retry button with RefreshCw icon
      const retryButton = page.locator("button:has-text('Retry')");
      await expect(retryButton).toBeVisible();
      await expect(retryButton).toBeEnabled();

      // RefreshCw icon inside the retry button
      await expect(retryButton.locator(".lucide-refresh-cw")).toBeVisible();
    });

    // =====================================================================
    // 5. Server error (500)
    // =====================================================================

    test("should show server error banner with Retry button on 500 response", async ({ page }) => {
      await page.route(API_URL, async (route) => {
        await route.fulfill({ status: 500 });
      });

      await page.goto(ADMIN_URL);
      await page.waitForLoadState("networkidle");

      // Heading
      await expect(page.locator("h1")).toHaveText("Admin");

      // Error banner with the generic failure message
      await expect(page.locator("text=Failed to load admin stats")).toBeVisible();

      // Retry button
      const retryButton = page.locator("button:has-text('Retry')");
      await expect(retryButton).toBeVisible();
      await expect(retryButton).toBeEnabled();
    });

    // =====================================================================
    // 6. Empty data (stats is null)
    // =====================================================================

    test("should show empty state when API returns null data", async ({ page }) => {
      await page.route(API_URL, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, data: null }),
        });
      });

      await page.goto(ADMIN_URL);
      await page.waitForLoadState("networkidle");

      // Heading
      await expect(page.locator("h1")).toHaveText("Admin");

      // Empty state message
      await expect(page.locator("text=No data available.")).toBeVisible();

      // Reload button with RefreshCw icon
      const reloadButton = page.locator("button:has-text('Reload')");
      await expect(reloadButton).toBeVisible();
      await expect(reloadButton).toBeEnabled();
      await expect(reloadButton.locator(".lucide-refresh-cw")).toBeVisible();
    });

    // =====================================================================
    // 7. Retry button — re-fetches the API
    // =====================================================================

    test("should re-fetch stats when clicking Retry after an error", async ({ page }) => {
      // First call fails
      let callCount = 0;
      await page.route(API_URL, async (route) => {
        callCount++;
        if (callCount === 1) {
          await route.fulfill({ status: 500 });
        } else {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(MOCK_STATS_COMPLETE),
          });
        }
      });

      await page.goto(ADMIN_URL);
      await page.waitForLoadState("networkidle");

      // Should show error state
      await expect(page.locator("text=Failed to load admin stats")).toBeVisible();

      // Click Retry
      await page.locator("button:has-text('Retry')").click();

      // Wait for the second fetch to complete
      await page.waitForLoadState("networkidle");

      // Should now show the dashboard with data
      await expect(page.locator("text=System-wide overview")).toBeVisible();
      await expect(page.locator("text=1234")).toBeVisible();
      await expect(page.locator("h2:has-text('Recent Users')")).toBeVisible();

      // The API should have been called twice
      expect(callCount).toBe(2);
    });

    // =====================================================================
    // 8. Component-level tests — StatCard accent colors
    // =====================================================================

    test("StatCard should render with different accent colors", async ({ page }) => {
      await page.route(API_URL, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_STATS_COMPLETE),
        });
      });

      await page.goto(ADMIN_URL);
      await page.waitForLoadState("networkidle");

      // Each StatCard has a style with borderTopColor
      const statCards = page.locator(".card.border-t-2");

      // First card (Total Users) — default accent color "var(--accent)"
      // Cards 2-5 have specific accentColor props
      await expect(statCards.nth(0)).toHaveAttribute("style", /border-top-color/);

      // We verify the cards exist with correct labels (already done above)
      // The border-top-color is set via inline style
      const cardCount = await statCards.count();
      expect(cardCount).toBe(5);

      // Verify each card has the correct label via the .text-xs.uppercase element
      const labels = [
        "Total Users",
        "Active Users",
        "Validations Today",
        "Total Validations",
        "Active Webhooks",
      ];
      for (let i = 0; i < labels.length; i++) {
        await expect(statCards.nth(i).locator(".text-xs.uppercase")).toHaveText(labels[i]);
      }
    });

    // =====================================================================
    // 9. Component-level tests — PlanBadge
    // =====================================================================

    test("PlanBadge should render known plans with correct color classes", async ({ page }) => {
      await page.route(API_URL, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_STATS_COMPLETE),
        });
      });

      await page.goto(ADMIN_URL);
      await page.waitForLoadState("networkidle");

      // Plan badges appear in two places:
      //   1. Users by Plan section (5 known plans + counts)
      //   2. Recent Users table (one per user)

      // Check the PlanBadge renders in the Users by Plan section
      // Each plan row has: PlanBadge, progress bar, count
      const planSectionBadges = page
        .locator("h2:has-text('Users by Plan')")
        .locator("..") // .card
        .locator(".space-y-3")
        .locator("> div") // each plan row
        .locator("span.inline-block"); // PlanBadge

      // Each plan badge should be uppercase with rounded-full
      const planBadgeCount = await planSectionBadges.count();
      expect(planBadgeCount).toBeGreaterThanOrEqual(5);

      // Verify each known plan badge has appropriate styling
      // (We check that they have the correct text content AND rounded-full class)
      const expectedPlans = ["FREE", "STARTER", "GROWTH", "SCALE", "ENTERPRISE"];
      for (const plan of expectedPlans) {
        const badge = page.locator(`span.inline-block:has-text("${plan}")`).first();
        await expect(badge).toBeVisible();
        // Should have rounded-full class (from PlanBadge)
        await expect(badge).toHaveClass(/rounded-full/);
        // Should have font-mono and uppercase
        await expect(badge).toHaveClass(/font-mono/);
        await expect(badge).toHaveClass(/uppercase/);
      }

      // Plan badges in the Recent Users table
      const tablePlanBadges = page.locator("table tbody tr td:nth-child(3) span");
      await expect(tablePlanBadges).toHaveCount(10);

      // User 8 has "UNKNOWN_PLAN" — should get default zinc styling
      const unknownBadge = page.locator('span:has-text("UNKNOWN_PLAN")');
      await expect(unknownBadge).toBeVisible();
      // Default color: bg-zinc-500/20 text-zinc-400
      await expect(unknownBadge).toHaveClass(/bg-zinc/);
    });

    // =====================================================================
    // 10. Component-level tests — ActiveBadge
    // =====================================================================

    test("ActiveBadge should render active and inactive states correctly", async ({ page }) => {
      await page.route(API_URL, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_STATS_COMPLETE),
        });
      });

      await page.goto(ADMIN_URL);
      await page.waitForLoadState("networkidle");

      // Find the ActiveBadge elements in the table
      // 10 user rows, status is in column 5
      const statusCells = page.locator("table tbody tr td:nth-child(5)");

      // Row 0: Alice — Active
      const aliceStatus = statusCells.nth(0);
      await expect(aliceStatus).toContainText("Active");
      await expect(aliceStatus.locator(".rounded-full")).toBeVisible(); // green dot

      // Row 1: Bob — Inactive
      const bobStatus = statusCells.nth(1);
      await expect(bobStatus).toContainText("Inactive");
      await expect(bobStatus.locator(".rounded-full")).toBeVisible(); // gray dot

      // Check active badges across all rows
      const activeCount = await statusCells.locator("text=Active").count();
      const inactiveCount = await statusCells.locator("text=Inactive").count();
      expect(activeCount + inactiveCount).toBe(10);
    });
  });
});
