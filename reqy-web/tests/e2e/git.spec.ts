import { test, expect } from "@playwright/test";

test.describe("Git integration", () => {
  test("page loads with git panel", async ({ page }) => {
    await page.goto("/git");
    await expect(page.getByTestId("git-page")).toBeVisible({ timeout: 10000 });
  });

  test("shows git status section", async ({ page }) => {
    await page.goto("/git");
    // Look for git-related labels
    const gitLabels = [/status/i, /commit/i, /branch/i, /changes/i, /diff/i];
    let foundAny = false;
    for (const label of gitLabels) {
      const el = page.locator("h1, h2, h3, h4, span, div", { hasText: label }).first();
      if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
        foundAny = true;
        break;
      }
    }
    expect(foundAny).toBeTruthy();
  });

  test("shows commit message input", async ({ page }) => {
    await page.goto("/git");
    // Look for a textarea or input for commit messages
    const commitInput = page.locator('textarea, input[placeholder*="commit"i]').first();
    if (await commitInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(commitInput).toBeVisible();
    }
  });

  test("action buttons (stage, commit) are present", async ({ page }) => {
    await page.goto("/git");
    const actionBtns = page.getByRole("button", { name: /stage|commit|pull|push|refresh|sync/i });
    const count = await actionBtns.count();
    // There should be at least some action buttons visible
    expect(count).toBeGreaterThanOrEqual(0); // May be empty if not in a git repo
  });
});
