import type { Page, Locator } from "@playwright/test"

export function urlInput(page: Page): Locator {
  return page.locator('input[type="url"], input[placeholder*="http"], input[name*="url"]').first()
}

export function sendButton(page: Page): Locator {
  return page.getByRole("button", { name: /^send$/i }).first()
}

export function statusBadge(page: Page): Locator {
  return page.locator('[data-testid="status-code"], .status-badge, [class*="status"]').first()
}

export function methodSelector(page: Page): Locator {
  return page.getByRole("combobox", { name: /method/i }).first()
}

export function collectionsLink(page: Page): Locator {
  return page.getByRole("link", { name: /collections/i }).first()
}

export function newCollectionButton(page: Page): Locator {
  return page.getByRole("button", { name: /new collection|create collection/i }).first()
}

export function collectionName(page: Page): Locator {
  return page.locator('input[name="name"], input[placeholder*="name" i]').first()
}

export function saveButton(page: Page): Locator {
  return page.getByRole("button", { name: /^save$|create|add/i }).first()
}

export function runButton(page: Page): Locator {
  return page.getByRole("button", { name: /^run$|^run collection/i }).first()
}

export function exportJunitButton(page: Page): Locator {
  return page.getByRole("button", { name: /junit|export.*junit/i }).first()
}

export function protocolTabs(page: Page): Locator {
  return page.getByRole("tablist").first()
}
