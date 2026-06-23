import { test, expect } from "@playwright/test"
import { startMockServer, stopMockServer } from "./fixtures/mock-server"

test.beforeAll(async () => { await startMockServer() })
test.afterAll(async () => { await stopMockServer() })

test("home page loads", async ({ page }) => {
  await page.goto("/")
  await expect(page).toHaveURL(/\/$/)
})

test("collections page loads", async ({ page }) => {
  await page.goto("/collections")
  await expect(page.locator("body")).toContainText(/collection/i)
})

test("dashboard page loads", async ({ page }) => {
  await page.goto("/dashboard")
  await expect(page.locator("body")).toBeVisible()
})
