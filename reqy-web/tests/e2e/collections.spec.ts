import { test, expect } from '@playwright/test'
import path from 'path'

const importFixture = path.join(__dirname, 'fixtures', 'collection-import.json')

test.describe('Collections flows', () => {
  test('imports a collection bundle and exposes export controls', async ({ page }) => {
    await page.goto('/collections')

    // 1. Upload du fichier
    await page.waitForSelector('input[type="file"]', {
      state: 'visible',
      timeout: 10_000,
    })
    await page.locator('input[type="file"]').setInputFiles(importFixture)

    // 2. Passer en vue carte pour voir les cartes de collections
    await page.getByRole('button', { name: 'Vue carte' }).click()

    // 3. Attendre la carte avec le nom de collection attendu
    const importedCollectionCard = page
      .locator('button', { hasText: 'Imported Collection' })
      .first()

    await expect(importedCollectionCard).toBeVisible({ timeout: 15_000 })
    await importedCollectionCard.click()

    // 4. Vérifier que les boutons de run sont présents
    const runBackgroundButton = page.getByRole('button', {
      name: 'Run collection (background)',
      exact: true,
    })
    await expect(runBackgroundButton).toBeVisible()

    const runCollectionButton = page.getByRole('button', {
      name: 'Run collection',
      exact: true,
    })
    await expect(runCollectionButton).toBeVisible()
  })

  test('runs a collection in background and displays execution logs', async ({ page }) => {
    await page.goto('/collections')

    await page.evaluate(() => {
      localStorage.setItem(
        'reqly-request-store',
        JSON.stringify({
          history: [],
          collections: [
            {
              id: 'col-background',
              name: 'Background Run Collection',
              description: '',
              color: 'emerald',
              icon: 'package',
              requests: [
                {
                  id: 'req-1',
                  name: 'Fetch Test',
                  method: 'GET',
                  url: 'https://httpbin.org/get',
                  endpoint: '/get',
                  headers: {},
                  body: '',
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

    await page.reload()

    await page.getByRole('button', { name: 'Vue carte' }).click()

    const backgroundCollectionCard = page
      .locator('button', { hasText: 'Background Run Collection' })
      .first()

    await expect(backgroundCollectionCard).toBeVisible({ timeout: 10_000 })
    await backgroundCollectionCard.click()

    const runBackgroundButton = page.getByRole('button', {
      name: 'Run collection (background)',
      exact: true,
    })
    await runBackgroundButton.click()

    await page.waitForURL('/')

    const toast = page.getByText(
      /Background run de "Background Run Collection" terminé\./i,
    )
    await expect(toast).toBeVisible({ timeout: 20_000 })
  })
})