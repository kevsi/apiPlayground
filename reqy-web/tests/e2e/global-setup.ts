import { startMockServer, stopMockServer } from "./fixtures/mock-server"

/**
 * Playwright globalSetup — runs once before the entire test suite.
 *
 * Starts the e2e mock server on a dynamic port (port 0 = OS picks a free
 * port) and writes the resulting URL to E2E_MOCK_URL so specs can consume
 * it without hard-coding a port that might collide with another process
 * or another developer's local services.
 *
 * Stop is handled by globalTeardown (same module path).
 */
export default async function globalSetup(): Promise<void> {
  const baseUrl = await startMockServer()
  // Persist for the duration of the test run. process.env is inherited by
  // worker processes spawned by Playwright.
  process.env.E2E_MOCK_URL = baseUrl
  // eslint-disable-next-line no-console
  console.log(`[e2e:global-setup] mock server listening at ${baseUrl}`)
}

export async function globalTeardown(): Promise<void> {
  await stopMockServer()
}
