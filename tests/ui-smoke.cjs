/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require('playwright');
const { existsSync } = require('node:fs');
const AxeBuilder = require('@axe-core/playwright').default;
let activeBrowser;

(async () => {
  const localChrome = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  activeBrowser = await chromium.launch({ headless: true, ...(existsSync(localChrome) ? { executablePath: localChrome } : {}) });
  const context = await activeBrowser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push(`HTTP ${response.status()} ${response.url()}`);
  });

  const navigationStarted = Date.now();
  await page.goto(process.env.WIKI_URL || 'http://127.0.0.1:3000', { waitUntil: 'domcontentloaded' });
  await page.locator('.page-tree .tree-item').first().waitFor();
  const shellLoadMs = Date.now() - navigationStarted;
  await page.waitForLoadState('networkidle');
  const pageCount = await page.locator('.page-tree .tree-item').count();
  if (pageCount < 1) throw new Error('The page tree did not render any active pages.');
  const documentAccessibility = await new AxeBuilder({ page }).analyze();

  await page.getByRole('button', { name: '그래프' }).click();
  await page.locator('.graph-stage').waitFor();
  const graphNodeCount = await page.locator('.graph-node').count();
  if (graphNodeCount < 1) throw new Error('The graph view did not render any nodes.');
  const graphAccessibility = await new AxeBuilder({ page }).analyze();

  await page.getByRole('button', { name: '문서' }).click();
  await page.locator('.editor-card').waitFor();
  await page.screenshot({ path: 'artifacts/ui-smoke.png', fullPage: true });

  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`);
  const accessibilityViolations = [...documentAccessibility.violations, ...graphAccessibility.violations].filter((item) => item.impact === 'critical' || item.impact === 'serious');
  if (accessibilityViolations.length) throw new Error(`Accessibility violations:\n${accessibilityViolations.map((item) => `${item.id}: ${item.help}\n${item.nodes.map((node) => `  ${node.target.join(' ')} — ${node.failureSummary}`).join('\n')}`).join('\n')}`);
  if (shellLoadMs > 2500) throw new Error(`Initial shell load exceeded the 2500 ms budget: ${shellLoadMs} ms.`);
  console.log(JSON.stringify({ pageCount, graphNodeCount, shellLoadMs, seriousAccessibilityViolations: 0, screenshot: 'artifacts/ui-smoke.png' }));
  await activeBrowser.close();
  activeBrowser = undefined;
})().catch(async (error) => {
  if (activeBrowser) await activeBrowser.close();
  console.error(error);
  process.exitCode = 1;
});
