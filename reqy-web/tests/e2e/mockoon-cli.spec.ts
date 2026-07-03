import { test, expect } from "@playwright/test"

test.describe("Mockoon CLI sidecar", () => {
  test("the sidecar is reachable after loading the mocks page", async ({ page, request }) => {
    // Load the mocks page. This triggers use-mock-store to reload the
    // Mockoon CLI sidecar via /api/mockoon/reload.
    await page.goto("/mocks")

    // Give the sidecar a moment to start before probing it. The reload is
    // fire-and-forget from the UI, so we poll briefly to avoid flakiness.
    const sidecarUrl = "http://127.0.0.1:3001/mock"
    let response = await request.get(sidecarUrl)

    for (let i = 0; i < 10 && response.status() === 0; i++) {
      await page.waitForTimeout(300)
      response = await request.get(sidecarUrl)
    }

    // The sidecar may return a 200 if a matching route is configured, or a
    // 404 (or other client error) if no route matches. Any non-zero status
    // below 500 proves the sidecar is running and accepting connections.
    expect(response.status()).toBeGreaterThan(0)
    expect(response.status()).toBeLessThan(500)
  })
})
