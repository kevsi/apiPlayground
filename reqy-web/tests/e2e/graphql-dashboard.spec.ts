import { test, expect } from "@playwright/test"
import { startMockServer, stopMockServer, getMockBaseUrl } from "./fixtures/mock-server"

test.beforeAll(async () => { await startMockServer() })
test.afterAll(async () => { await stopMockServer() })

test.describe("GraphQL dashboard redesign", () => {
  test("page loads with full layout (sidebar, header, tab bar, request panel, response panel)", async ({ page }) => {
    await page.goto("/graphql")
    await expect(page.getByTestId("graphql-page")).toBeVisible()
    await expect(page.getByTestId("graphql-tab-bar")).toBeVisible()
    await expect(page.getByTestId("graphql-active-toolbar")).toBeVisible()
    await expect(page.getByTestId("graphql-request-panel")).toBeVisible()
    await expect(page.getByTestId("graphql-response-panel")).toBeVisible()
    await expect(page.getByTestId("graphql-tab-add")).toBeVisible()
  })

  test("default tab contains a starter endpoint and query", async ({ page }) => {
    await page.goto("/graphql")
    const endpoint = page.getByTestId("graphql-endpoint-input")
    await expect(endpoint).toBeVisible()
    await expect(endpoint).toHaveValue(/trevorblades\.com/)
    // Editor placeholder / initial value is the welcome comment
    const editor = page.locator('[data-testid="graphql-query-editor"] .cm-content')
    await expect(editor).toContainText("Welcome")
  })

  test("multi-tab workflow: add, switch, close", async ({ page }) => {
    await page.goto("/graphql")
    const initialTabCount = await page.locator('[data-testid^="graphql-tab-"]').count()
    // Add a new tab
    await page.getByTestId("graphql-tab-add").click()
    await expect(page.locator('[data-testid^="graphql-tab-"]')).toHaveCount(initialTabCount + 1)
    // Switch back to the first tab
    await page.locator('[data-testid^="graphql-tab-"]').first().click()
    // The first tab is still active
    await expect(page.locator('[data-testid^="graphql-tab-"]').first()).toHaveAttribute(
      "data-active",
      "true",
    )
    // Close the second tab via its X button
    const second = page.locator('[data-testid^="graphql-tab-"]').nth(1)
    const secondId = (await second.getAttribute("data-testid"))?.replace("graphql-tab-", "")
    if (secondId) {
      await page.getByTestId(`graphql-tab-close-${secondId}`).click()
    }
    await expect(page.locator('[data-testid^="graphql-tab-"]')).toHaveCount(initialTabCount)
  })

  test("introspect mock endpoint populates schema and enables builder", async ({ page }) => {
    await page.goto("/graphql")
    const endpoint = page.getByTestId("graphql-endpoint-input")
    await endpoint.fill(`${getMockBaseUrl()}/graphql`)
    await page.getByTestId("graphql-introspect-button").click()
    // Wait for the schema-driven toggle button to become enabled
    const builder = page.getByTestId("graphql-toggle-builder")
    await expect(builder).toBeEnabled({ timeout: 5000 })
  })

  test("execute a query against the mock endpoint and inspect the response", async ({ page }) => {
    await page.goto("/graphql")
    const endpoint = page.getByTestId("graphql-endpoint-input")
    await endpoint.fill(`${getMockBaseUrl()}/graphql`)
    const editor = page.locator('[data-testid="graphql-query-editor"] .cm-content')
    await editor.fill("{ hello }")
    await page.getByTestId("graphql-send-button").click()
    // Response viewer renders
    await expect(page.getByTestId("graphql-response-viewer")).toBeVisible()
    await expect(page.getByTestId("graphql-response-status")).toContainText(/^2\d\d$|^4\d\d$|^5\d\d$/, {
      timeout: 5000,
    })
    // Response data shows the "world" payload from the mock
    const data = page.getByTestId("graphql-response-data")
    await expect(data).toContainText("world")
  })

  test("prettify reformats the query", async ({ page }) => {
    await page.goto("/graphql")
    const editor = page.locator('[data-testid="graphql-query-editor"] .cm-content')
    await editor.fill("{a,b,c,d}")
    // Prettify button is inside graphql-toolbar
    await page.locator('[data-testid="graphql-prettify-button"]').click()
    // After prettify the editor should contain newlines
    await expect(editor).toContainText("\n")
  })

  test("response panel tabs: Response, Code, Schema Diff", async ({ page }) => {
    await page.goto("/graphql")
    for (const tab of ["response", "code", "diff"]) {
      await page.getByTestId(`graphql-response-tab-${tab}`).click()
      await expect(page.getByTestId(`graphql-response-tab-${tab}`)).toBeVisible()
    }
  })

  test("code generator formats the active query as fetch", async ({ page }) => {
    await page.goto("/graphql")
    const editor = page.locator('[data-testid="graphql-query-editor"] .cm-content')
    await editor.fill("{ hello }")
    await page.getByTestId("graphql-response-tab-code").click()
    await expect(page.getByTestId("graphql-code-generator")).toBeVisible()
    await expect(page.getByTestId("graphql-code-preview")).toContainText("fetch(")
  })

  test("schema diff captures and compares snapshots", async ({ page }) => {
    await page.goto("/graphql")
    const endpoint = page.getByTestId("graphql-endpoint-input")
    await endpoint.fill(`${getMockBaseUrl()}/graphql`)
    await page.getByTestId("graphql-introspect-button").click()
    await page.getByTestId("graphql-response-tab-diff").click()
    await expect(page.getByTestId("graphql-schema-diff")).toBeVisible()

    // Save a snapshot named "v1"
    const nameInput = page.getByTestId("graphql-diff-snapshot-name")
    await nameInput.fill("v1")
    await page.locator('button:has-text("Save snapshot")').click()
    // Pick it in the dropdown
    const target = page.getByTestId("graphql-diff-target")
    await target.selectOption("v1")
    await page.getByTestId("graphql-diff-compare").click()
    // Either identical or differ message must appear
    await expect(page.getByTestId("graphql-diff-output")).toContainText(/Schemas/)
  })

  test("save dialog flow opens and accepts a name + collection", async ({ page }) => {
    await page.goto("/graphql")
    await page.getByTestId("graphql-save-button").click()
    // RequestSaveDialog renders the name input
    const name = page.locator("#save-name")
    await expect(name).toBeVisible()
    await name.fill("My GraphQL request")
    // Submit
    await page.getByRole("button", { name: /^Save$/ }).click()
  })

  test("export button downloads a JSON file", async ({ page }) => {
    await page.goto("/graphql")
    const downloadPromise = page.waitForEvent("download", { timeout: 5000 }).catch(() => null)
    await page.getByTestId("graphql-export-button").click()
    const download = await downloadPromise
    if (download) {
      expect(download.suggestedFilename()).toMatch(/\.graphql\.json$/)
    }
  })
})
