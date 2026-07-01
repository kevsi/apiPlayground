import { stopMockServer } from "./fixtures/mock-server"

/**
 * Playwright globalTeardown — runs once after the entire test suite.
 * Stops the mock server started by global-setup.ts.
 */
export default async function globalTeardown(): Promise<void> {
  await stopMockServer()
}
