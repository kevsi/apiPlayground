import { test, expect } from '@playwright/test'

test.describe('Mock Server flows', () => {
  test('creates a mock route and intercepts the request', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[role="tab"]', { timeout: 10_000 })

    // Open mock panel (if available via sidebar or button)
    const mockButton = page.getByRole('button', { name: /mock/i }).first()
    if (await mockButton.isVisible().catch(() => false)) {
      await mockButton.click()
    }

    // Navigate to mocks page if not available inline
    await page.goto('/mocks')
    await page.waitForSelector('text=/Mock|mock/i', { timeout: 10_000 })

    // Add a mock route
    const addMockButton = page.getByRole('button', { name: /add mock|ajouter mock/i }).first()
    await addMockButton.click()

    const pathInput = page.locator('input[placeholder*="path"]').first()
    await pathInput.fill('/api/test-mock')

    const statusInput = page.locator('input[placeholder*="status"], input[type="number"]').first()
    await statusInput.fill('200')

    const bodyEditor = page.locator('textarea').first()
    await bodyEditor.fill(JSON.stringify({ mocked: true }))

    const saveButton = page.getByRole('button', { name: /save|sauvegarder/i }).first()
    await saveButton.click()

    // Go back to editor and send request matching the mock
    await page.goto('/')
    await page.waitForSelector('[role="tab"]', { timeout: 10_000 })

    const urlInput = page.locator('input[placeholder*="URL"], input[name="url"]').first()
    await urlInput.fill('http://localhost:3000/api/test-mock')

    const sendButton = page.getByRole('button', { name: /send|envoyer/i }).first()
    await sendButton.click()

    // Response should indicate it was mocked (mocked badge or status)
    const mockedIndicator = page.locator('text=/mocked|MOCKED/i').first()
    await expect(mockedIndicator).toBeVisible({ timeout: 10_000 })
  })
})
