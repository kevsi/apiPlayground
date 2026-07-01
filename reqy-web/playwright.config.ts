import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  // Playwright's `globalSetup` / `globalTeardown` are file paths (resolved
  // by Playwright's own loader), not imported function references. The
  // global-setup.ts module exposes both `default` (setup) and `globalTeardown`
  // — Playwright picks `default` for setup and the named export for teardown.
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 10000,
    ignoreHTTPSErrors: true,
  },
  webServer: {
    command: 'pnpm dev --port 3000',
    port: 3000,
    reuseExistingServer: true,
    cwd: __dirname,
    timeout: 120000,
  },
})
