/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require('playwright');
const { existsSync } = require('node:fs');

(async () => {
  const localChrome = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await chromium.launch({ headless: true, ...(existsSync(localChrome) ? { executablePath: localChrome } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push(`HTTP ${response.status()} ${response.url()}`);
  });

  await page.goto(process.env.WIKI_URL || 'http://127.0.0.1:3000', { waitUntil: 'networkidle' });
  await page.locator('.page-tree .tree-item').first().waitFor();
  const pageCount = await page.locator('.page-tree .tree-item').count();
  if (pageCount < 1) throw new Error('The page tree did not render any active pages.');

  await page.getByRole('button', { name: '그래프' }).click();
  await page.locator('.graph-stage').waitFor();
  const graphNodeCount = await page.locator('.graph-node').count();
  if (graphNodeCount < 1) throw new Error('The graph view did not render any nodes.');

  await page.getByRole('button', { name: '문서' }).click();
  await page.locator('.editor-card').waitFor();
  await page.screenshot({ path: 'artifacts/ui-smoke.png', fullPage: true });

  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`);
  console.log(JSON.stringify({ pageCount, graphNodeCount, screenshot: 'artifacts/ui-smoke.png' }));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
