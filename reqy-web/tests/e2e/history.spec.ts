import { test, expect } from "@playwright/test"
import { startMockServer, stopMockServer, getMockBaseUrl } from "./fixtures/mock-server"
import { urlInput, sendButton, responseStatus } from "./helpers/page-objects"

test.beforeAll(async () => { await startMockServer() })
test.afterAll(async () => { await stopMockServer() })

test("execute a GET request", async ({ page }) => {
  await page.goto("/")
  await urlInput(page).fill(`${getMockBaseUrl()}/mock`)
  await sendButton(page).click()
  await expect(responseStatus(page)).toContainText(/200/, { timeout: 10000 })
})

test("request appears in history", async ({ page }) => {
  await page.goto("/")
  await urlInput(page).fill(`${getMockBaseUrl()}/mock`)
  await sendButton(page).click()
  await expect(responseStatus(page)).toContainText(/200/, { timeout: 10000 })
  // Click history button in sidebar
  await page.getByRole("button", { name: /history/i }).first().click()
  await expect(page.locator("body")).toContainText(/mock/i, { timeout: 5000 })
})
