const { chromium } = require('@playwright/test');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  page.on('console', (msg) => console.log('PAGE_CONSOLE>', msg.text()));
  page.on('pageerror', (err) => console.log('PAGE_ERROR>', err && err.message));
  page.on('requestfailed', (req) => { const f = req.failure(); console.log('REQUEST_FAILED>', req.url(), f && f.errorText) });
  page.on('dialog', async (d) => { console.log('DIALOG>', d.message()); try { await d.dismiss() } catch {} });
  await page.goto('http://localhost:3000/collections');
  const html = await page.content();
  console.log('PAGE_HTML_START');
  console.log(html.slice(0, 2000));
  console.log('PAGE_HTML_END');
  const hasInput = (await page.$("input[type=\"file\"]")) !== null;
  console.log('hasInput', hasInput);
  const inputCount = await page.evaluate(() => document.querySelectorAll('input[type=file]').length);
  console.log('inputCount', inputCount);
  const inputsOuter = await page.evaluate(() => Array.from(document.querySelectorAll('input[type=file]')).map((el) => el.outerHTML));
  console.log('inputsOuter', inputsOuter);
  // Click the New button to test onAddCollection handler
  try {
    const btn = await page.$('button:has-text("New")');
    if (btn) {
      const outer = await btn.evaluate((el) => el.outerHTML);
      console.log('newButtonOuterHTML', outer);
      await btn.click();
      await page.waitForTimeout(200);
      const storeAfterNew = await page.evaluate(() => localStorage.getItem('zendeeps-request-store'));
      console.log('storeAfterNew', storeAfterNew);
      const hasNewCollection = await page.locator('text=New Collection').count();
      console.log('hasNewCollection', hasNewCollection);
    } else {
      console.log('New button not found')
    }
  } catch (e) {
    console.log('click New failed', e.message);
  }
  await page.evaluate(() => {
    window.__importEvent = false;
    const el = document.querySelector("input[type=\"file\"]");
    if (el) el.addEventListener('change', () => { window.__importEvent = true; console.log('change fired'); });
  });
  const importFixture = path.resolve('tests/e2e/fixtures/collection-import.json');
  await page.locator("input[type=\"file\"]").setInputFiles(importFixture);
  await page.waitForTimeout(500);
  const eventFired = await page.evaluate(() => window.__importEvent);
  const store = await page.evaluate(() => localStorage.getItem('zendeeps-request-store'));
  console.log('eventFired', eventFired, 'store', store);
  // Check whether the Imported Collection text appears in the DOM
  try {
    const visibleCount = await page.locator('text=Imported Collection').count();
    console.log('visibleCount', visibleCount);
  } catch (e) {
    console.log('check visible failed', e.message);
  }
  // Dump any elements whose textContent contains the imported name
  try {
    const matches = await page.evaluate(() => {
      const res = [];
      const nodes = Array.from(document.querySelectorAll('*'));
      for (const n of nodes) {
        try {
          if (n.textContent && n.textContent.includes('Imported Collection')) {
            res.push({ tag: n.tagName, outer: n.outerHTML.slice(0, 400) });
          }
        } catch {}
      }
      return res.slice(0, 20);
    });
    console.log('matches', matches);
  } catch (e) {
    console.log('dump failed', e.message);
  }
  // Inspect the Collections panel container near the h3 heading
  try {
    const area = await page.evaluate(() => {
      const hs = Array.from(document.querySelectorAll('h3'))
      const h = hs.find(el => el.textContent && el.textContent.includes('Collections'))
      if (!h) return { found: false }
      const parent = h.closest('div')
      return { found: true, html: parent ? parent.outerHTML.slice(0, 2000) : null }
    })
    console.log('collectionsArea', area)
  } catch (e) {
    console.log('inspect area failed', e.message)
  }
  // Dump document HTML after import
  try {
    const postHtml = await page.content();
    console.log('POST_HTML_INCLUDES_IMPORTED?', postHtml.includes('Imported Collection'))
    console.log('POST_HTML_SNIPPET', postHtml.slice(0, 2000))
  } catch (e) {
    console.log('post html failed', e.message)
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
