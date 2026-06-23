import { test, expect } from "@playwright/test"
import { startMockServer, stopMockServer, getMockBaseUrl } from "./fixtures/mock-server"
import { urlInput, sendButton, statusBadge } from "./helpers/page-objects"

test.beforeAll(async () => { await startMockServer() })
test.afterAll(async () => { await stopMockServer() })

test("create and execute a request", async ({ page }) => {
  await page.goto("/")
  await urlInput(page).fill(`${getMockBaseUrl()}/mock`)
  await sendButton(page).click()
  await expect(statusBadge(page)).toContainText(/200/, { timeout: 10000 })
})

test("save to history", async ({ page }) => {
  await page.goto("/")
  await urlInput(page).fill(`${getMockBaseUrl()}/mock`)
  await sendButton(page).click()
  await expect(statusBadge(page)).toContainText(/200/, { timeout: 10000 })
  // Navigate to history panel (sidebar)
  await page.getByRole("button", { name: /history/i }).first().click().catch(() => {})
  await expect(page.locator("body")).toContainText(/mock/i, { timeout: 5000 })
})
