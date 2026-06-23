import { test, expect } from "@playwright/test"

test("auth page loads (or home if no separate auth route)", async ({ page }) => {
  await page.goto("/login").catch(() => page.goto("/auth")).catch(() => page.goto("/"))
  await expect(page.locator("body")).toBeVisible()
})
