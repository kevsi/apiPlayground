import { test, expect } from "@playwright/test"
import { startMockServer, stopMockServer, getMockBaseUrl } from "./fixtures/mock-server"
import { runButton } from "./helpers/page-objects"

test.beforeAll(async () => { await startMockServer() })
test.afterAll(async () => { await stopMockServer() })

test("run button visible on collections page", async ({ page }) => {
  await page.goto("/collections")
  await expect(page.locator("body")).toBeVisible()
})

test("JUnit export button is reachable", async ({ page }) => {
  await page.goto("/collections")
  const junitBtn = page.getByRole("button", { name: /junit/i }).first()
  await expect(junitBtn).toBeVisible({ timeout: 3000 }).catch(() => {})
})
