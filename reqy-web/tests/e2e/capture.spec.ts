import { test, expect } from "@playwright/test";

test.describe("Capture (HTTP proxy)", () => {
  test("page loads with main elements", async ({ page }) => {
    await page.goto("/capture");
    // The capture page should show the capture detail section
    const detail = page.getByTestId("capture-detail").first();
    await expect(detail).toBeVisible({ timeout: 10000 });
  });

  test("shows capture sessions header", async ({ page }) => {
    await page.goto("/capture");
    // Should show a header or title related to proxy/sessions
    const title = page.locator("h1, h2, h3", { hasText: /capture|proxy|session/i }).first();
    await expect(title).toBeVisible({ timeout: 10000 });
  });

  test("has action buttons (start/stop proxy)", async ({ page }) => {
    await page.goto("/capture");
    // Look for start/stop proxy buttons
    const startBtn = page.getByRole("button", { name: /start|begin|play|demarrer/i }).first();
    const clearBtn = page.getByRole("button", { name: /clear|trash|vider/i }).first();

    // At least some action buttons should exist
    const hasActionButtons =
      (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) ||
      (await clearBtn.isVisible({ timeout: 1000 }).catch(() => false));
    expect(hasActionButtons).toBeTruthy();
  });
});
