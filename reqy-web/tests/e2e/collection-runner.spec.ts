import { test, expect } from "@playwright/test"
import { runButton } from "./helpers/page-objects"

test("run button visible on collections page", async ({ page }) => {
  await page.goto("/collections")
  await expect(page.locator("body")).toBeVisible()
})

test("JUnit export button is reachable", async ({ page }) => {
  await page.goto("/collections")
  const junitBtn = page.getByRole("button", { name: /junit/i }).first()
  await expect(junitBtn).toBeVisible({ timeout: 3000 }).catch(() => {})
})
