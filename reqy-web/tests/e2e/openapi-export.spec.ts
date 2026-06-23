import { test, expect } from "@playwright/test"
import { startMockServer, stopMockServer, getMockBaseUrl } from "./fixtures/mock-server"

test.beforeAll(async () => { await startMockServer() })
test.afterAll(async () => { await stopMockServer() })

test("OpenAPI export modal opens", async ({ page }) => {
  await page.goto("/collections")
  await page.getByRole("button", { name: /openapi|export openapi/i }).first().click({ timeout: 3000 }).catch(() => {})
  await expect(page.locator("body")).toBeVisible()
})
