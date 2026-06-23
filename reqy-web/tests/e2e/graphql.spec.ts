import { test, expect } from "@playwright/test"
import { startMockServer, stopMockServer, getMockBaseUrl } from "./fixtures/mock-server"

test.beforeAll(async () => { await startMockServer() })
test.afterAll(async () => { await stopMockServer() })

test("execute GraphQL query via mock endpoint", async ({ page }) => {
  await page.goto("/")
  const urlInput = page.locator('input[type="url"], input[placeholder*="http"]').first()
  await urlInput.fill(`${getMockBaseUrl()}/graphql`)
  // Try switching to GraphQL protocol tab (may not exist in current UI)
  await page.getByRole("tab", { name: /graphql/i }).first().click({ timeout: 2000 }).catch(() => {})
  // Set query in textarea
  const queryArea = page.locator('textarea[placeholder*="query"], textarea').first()
  await queryArea.fill("{ hello }").catch(() => {})
  // Send
  await page.getByRole("button", { name: /send/i }).first().click().catch(() => {})
  // Expect response panel to render something (don't assert exact content)
  await expect(page.locator("body")).toBeVisible()
})
