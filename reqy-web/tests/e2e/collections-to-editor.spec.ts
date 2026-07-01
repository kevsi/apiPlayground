import { test, expect } from '@playwright/test'

test.describe('Collections to Editor flow', () => {
  test('opens a collection request in a new tab from the collections page', async ({ page }) => {
    // Seed a collection with a request in localStorage
    await page.evaluate(() => {
      localStorage.setItem(
        'reqly-request-store',
        JSON.stringify({
          history: [],
          collections: [
            {
              id: 'col-test',
              name: 'Test Collection',
              description: '',
              color: 'emerald',
              icon: 'package',
              requests: [
                {
                  id: 'req-test-1',
                  name: 'Get Test',
                  method: 'GET',
                  url: 'https://httpbin.org/get',
                  endpoint: '/get',
                  headers: {},
                  body: '',
                  bodyType: 'json',
                  authType: 'none',
                  authToken: '',
                  queryParams: [{ key: 'foo', value: 'bar' }],
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                },
              ],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
          environments: [
            {
              id: 'env-global',
              name: 'Global',
              color: 'slate',
              variables: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
          notifications: [],
          variableMappings: [],
          activeEnvironmentId: 'env-global',
          projects: [],
          selectedProjectId: null,
        }),
      )
    })

    // Navigate to collections page
    await page.goto('/collections')
    await page.waitForSelector('text=/Test Collection/i', { timeout: 10_000 })

    // Click the collection request
    await page.getByText('Get Test', { exact: false }).click()

    // Should navigate to editor and show the request in a new tab
    await page.waitForURL('/')
    await page.waitForSelector('[role="tab"]', { timeout: 10_000 })

    // Verify the tab name matches the request
    const tab = page.locator('[role="tab"]', { hasText: 'Get Test' }).first()
    await expect(tab).toBeVisible()

    // Verify the URL is loaded
    const urlInput = page.locator('input[placeholder*="URL"], input[name="url"]').first()
    await expect(urlInput).toHaveValue(/httpbin\.org\/get/)
  })

  test('activates existing tab when clicking a request already open', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem(
        'reqly-request-store',
        JSON.stringify({
          history: [],
          collections: [
            {
              id: 'col-test',
              name: 'Test Collection',
              description: '',
              color: 'emerald',
              icon: 'package',
              requests: [
                {
                  id: 'req-test-1',
                  name: 'Get Test',
                  method: 'GET',
                  url: 'https://httpbin.org/get',
                  endpoint: '/get',
                  headers: {},
                  body: '',
                  bodyType: 'json',
                  authType: 'none',
                  authToken: '',
                  queryParams: [],
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                },
              ],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
          environments: [
            {
              id: 'env-global',
              name: 'Global',
              color: 'slate',
              variables: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
          notifications: [],
          variableMappings: [],
          activeEnvironmentId: 'env-global',
          projects: [],
          selectedProjectId: null,
        }),
      )
    })

    // Go to collections and click the request
    await page.goto('/collections')
    await page.getByText('Get Test', { exact: false }).click()
    await page.waitForURL('/')

    // Count tabs before second click
    const tabsBefore = await page.locator('[role="tab"]').count()

    // Go back to collections and click the same request again
    await page.goto('/collections')
    await page.getByText('Get Test', { exact: false }).click()
    await page.waitForURL('/')

    // Count tabs after second click — should be the same (no duplicate)
    const tabsAfter = await page.locator('[role="tab"]').count()
    expect(tabsAfter).toBe(tabsBefore)
  })
})
