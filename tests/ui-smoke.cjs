/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("playwright");
const { existsSync } = require("node:fs");
const AxeBuilder = require("@axe-core/playwright").default;
let activeBrowser;

(async () => {
  const localChrome =
    process.env.CHROME_PATH ||
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  activeBrowser = await chromium.launch({
    headless: true,
    ...(existsSync(localChrome) ? { executablePath: localChrome } : {}),
  });
  const context = await activeBrowser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const baseUrl = process.env.WIKI_URL || "http://127.0.0.1:3000";
  const errors = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().startsWith("Failed to load resource:")
    )
      errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400 && !response.url().endsWith("/favicon.ico"))
      errors.push(`HTTP ${response.status()} ${response.url()}`);
  });

  const shellLoadSamplesMs = [];
  for (let sample = 0; sample < 4; sample++) {
    const navigationStarted = Date.now();
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.locator(".page-tree .tree-item").first().waitFor();
    shellLoadSamplesMs.push(Date.now() - navigationStarted);
  }
  const sortedShellLoads = [...shellLoadSamplesMs].sort((a, b) => a - b),
    shellLoadP75Ms =
      sortedShellLoads[Math.ceil(sortedShellLoads.length * 0.75) - 1];
  const roleStamp = Date.now();
  const editorEmail = `editor-${roleStamp}@sites.test`;
  const viewerEmail = `viewer-${roleStamp}@sites.test`;
  for (const [email, role] of [
    [editorEmail, "editor"],
    [viewerEmail, "viewer"],
  ]) {
    const response = await context.request.post(`${baseUrl}/api/members`, {
      data: { email, role },
    });
    if (response.status() !== 201)
      throw new Error(`Could not create ${role} test membership.`);
  }
  const editorContext = await activeBrowser.newContext({
    extraHTTPHeaders: { "x-liminal-test-user-email": editorEmail },
  });
  const viewerContext = await activeBrowser.newContext({
    extraHTTPHeaders: { "x-liminal-test-user-email": viewerEmail },
  });
  const outsiderContext = await activeBrowser.newContext({
    extraHTTPHeaders: {
      "x-liminal-test-user-email": `outsider-${roleStamp}@sites.test`,
    },
  });
  const viewerSession = await viewerContext.request.get(
    `${baseUrl}/api/session/capabilities`,
  );
  const viewerCapabilities = (await viewerSession.json()).data.capabilities;
  if (!viewerCapabilities.can_read || viewerCapabilities.can_write)
    throw new Error("Viewer capability projection is incorrect.");
  const deniedViewerWrite = await viewerContext.request.post(
    `${baseUrl}/api/pages`,
    {
      data: {
        title: "Viewer write must fail",
        page_type: "note",
        markdown: "# denied",
        parent_id: null,
        operation_id: crypto.randomUUID(),
      },
    },
  );
  if (deniedViewerWrite.status() !== 403)
    throw new Error("Viewer write was not denied by the API.");
  const deniedMemberManagement = await editorContext.request.get(
    `${baseUrl}/api/members`,
  );
  if (deniedMemberManagement.status() !== 403)
    throw new Error("Editor member management was not denied.");
  const deniedFullBackup = await editorContext.request.post(
    `${baseUrl}/api/export/prepare`,
    { data: { profile: "full", include_member_reference: false } },
  );
  if (deniedFullBackup.status() !== 403)
    throw new Error("Editor full backup was not denied.");
  const deniedOutsiderRead = await outsiderContext.request.get(
    `${baseUrl}/api/pages`,
  );
  if (deniedOutsiderRead.status() !== 403)
    throw new Error("Non-member page read was not denied.");
  const editorPageTitle = `Editor Matrix ${roleStamp}`;
  const editorCreate = await editorContext.request.post(
    `${baseUrl}/api/pages`,
    {
      data: {
        title: editorPageTitle,
        page_type: "note",
        markdown: "# Editor matrix",
        parent_id: null,
        operation_id: crypto.randomUUID(),
      },
    },
  );
  if (editorCreate.status() !== 201)
    throw new Error("Editor could not create a page.");
  const editorPage = (await editorCreate.json()).data;
  const editorCleanup = await editorContext.request.delete(
    `${baseUrl}/api/pages/${editorPage.page_id}`,
    {
      data: {
        expected_version: editorPage.version,
        confirmation: `DELETE ${editorPageTitle}`,
        reason: "Role matrix cleanup",
        operation_id: crypto.randomUUID(),
      },
    },
  );
  if (!editorCleanup.ok()) throw new Error("Editor cleanup was not allowed.");
  await editorContext.close();
  await viewerContext.close();
  await outsiderContext.close();
  const atomicityProbe = await context.request.post(
    `${baseUrl}/api/maintenance/diagnostics`,
  );
  const atomicityResult = (await atomicityProbe.json()).data;
  if (!atomicityProbe.ok() || !atomicityResult.atomic)
    throw new Error("D1 transactional batch left a partial commit.");
  const securityTitle = `Security ${Date.now()}`;
  const operationId = crypto.randomUUID();
  const securityMarkdown = `# ${securityTitle}\n\nSECURITY_SENTINEL\n\n<script>window.__wikiXss=1</script>\n\n[unsafe](javascript:window.__wikiXss=2)\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n$E=mc^2$\n\n\`\`\`mermaid\ngraph TD\n  A[Safe] --> B[Rendered]\n\`\`\``;
  const createBody = {
    title: securityTitle,
    page_type: "note",
    markdown: securityMarkdown,
    parent_id: null,
    operation_id: operationId,
  };
  const createResponse = await context.request.post(`${baseUrl}/api/pages`, {
    data: createBody,
  });
  if (createResponse.status() !== 201)
    throw new Error(
      `Security page create failed: ${createResponse.status()} ${await createResponse.text()}`,
    );
  const created = (await createResponse.json()).data;
  const replay = await context.request.post(`${baseUrl}/api/pages`, {
    data: createBody,
  });
  const replayed = (await replay.json()).data;
  if (replay.status() !== 201 || replayed.page_id !== created.page_id)
    throw new Error("Idempotent create replay produced a different page.");
  const mismatch = await context.request.post(`${baseUrl}/api/pages`, {
    data: { ...createBody, title: `${securityTitle} mismatch` },
  });
  if (mismatch.status() !== 409)
    throw new Error(
      `Idempotency payload mismatch should return 409, received ${mismatch.status()}.`,
    );
  const race = await Promise.all(
    ["race-a", "race-b"].map((summary) =>
      context.request.patch(`${baseUrl}/api/pages/${created.page_id}`, {
        data: {
          expected_version: created.version,
          markdown: securityMarkdown,
          change_summary: summary,
          operation_id: crypto.randomUUID(),
        },
      }),
    ),
  );
  const raceStatuses = race.map((response) => response.status()).sort();
  if (JSON.stringify(raceStatuses) !== JSON.stringify([200, 409]))
    throw new Error(
      `CAS race should have exactly one winner: ${raceStatuses.join(",")}`,
    );
  const raceWinner = race.find((response) => response.status() === 200);
  const currentVersion = (await raceWinner.json()).data.version;
  const stale = await context.request.patch(
    `${baseUrl}/api/pages/${created.page_id}`,
    {
      data: {
        expected_version: 999,
        markdown: securityMarkdown,
        change_summary: "stale security test",
        operation_id: crypto.randomUUID(),
      },
    },
  );
  if (stale.status() !== 409)
    throw new Error(
      `Stale update should return 409, received ${stale.status()}.`,
    );
  const search = await context.request.post(`${baseUrl}/api/search`, {
    data: { query: "SECURITY_SENTINEL", limit: 20 },
  });
  const searchData = (await search.json()).data;
  if (!searchData.results.some((result) => result.page_id === created.page_id))
    throw new Error("Body search did not find the security page.");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: new RegExp(securityTitle) }).click();
  await page.getByRole("button", { name: "미리보기" }).click();
  await page.locator(".markdown-preview table").waitFor();
  await page.locator(".markdown-preview .katex").waitFor();
  await page.locator(".mermaid-diagram").waitFor();
  if (await page.evaluate(() => window.__wikiXss))
    throw new Error("Untrusted Markdown executed script content.");
  const unsafeHref = await page
    .locator('.markdown-preview a:has-text("unsafe")')
    .getAttribute("href");
  if (unsafeHref && unsafeHref.toLowerCase().startsWith("javascript:"))
    throw new Error("Unsafe Markdown URL scheme survived rendering.");
  await page.waitForLoadState("networkidle");
  const pageCount = await page.locator(".page-tree .tree-item").count();
  if (pageCount < 1)
    throw new Error("The page tree did not render any active pages.");
  const documentAccessibility = await new AxeBuilder({ page }).analyze();

  await page.getByRole("button", { name: "그래프" }).click();
  await page.locator(".graph-stage").waitFor();
  const graphNodeCount = await page.locator(".graph-node").count();
  if (graphNodeCount < 1)
    throw new Error("The graph view did not render any nodes.");
  const graphAccessibility = await new AxeBuilder({ page }).analyze();

  await page.getByRole("button", { name: "운영과 복구" }).click();
  await page.locator(".operations-stage").waitFor();
  await page.locator(".audit-list article").first().waitFor();
  const auditEventCount = await page.locator(".audit-list article").count();
  if (auditEventCount < 1)
    throw new Error("The operations view did not render the audit trail.");
  const operationsAccessibility = await new AxeBuilder({ page }).analyze();

  await page.getByRole("button", { name: "문서" }).click();
  await page.locator(".editor-card").waitFor();
  await page.screenshot({ path: "artifacts/ui-smoke.png", fullPage: true });

  const cleanup = await context.request.delete(
    `${baseUrl}/api/pages/${created.page_id}`,
    {
      data: {
        expected_version: currentVersion,
        confirmation: `DELETE ${securityTitle}`,
        reason: "Automated security smoke cleanup",
        operation_id: crypto.randomUUID(),
      },
    },
  );
  if (!cleanup.ok())
    throw new Error(
      `Security page cleanup failed: ${cleanup.status()} ${await cleanup.text()}`,
    );
  for (const email of [editorEmail, viewerEmail]) {
    const response = await context.request.delete(
      `${baseUrl}/api/members/${encodeURIComponent(email)}`,
    );
    if (!response.ok()) throw new Error(`Could not remove role test ${email}.`);
  }

  if (errors.length) throw new Error(`Browser errors:\n${errors.join("\n")}`);
  const accessibilityViolations = [
    ...documentAccessibility.violations,
    ...graphAccessibility.violations,
    ...operationsAccessibility.violations,
  ].filter((item) => item.impact === "critical" || item.impact === "serious");
  if (accessibilityViolations.length)
    throw new Error(
      `Accessibility violations:\n${accessibilityViolations.map((item) => `${item.id}: ${item.help}\n${item.nodes.map((node) => `  ${node.target.join(" ")} — ${node.failureSummary}`).join("\n")}`).join("\n")}`,
    );
  if (shellLoadP75Ms > 2500)
    throw new Error(
      `Shell load p75 exceeded the 2500 ms budget: ${shellLoadP75Ms} ms (${shellLoadSamplesMs.join(", ")}).`,
    );
  console.log(
    JSON.stringify({
      pageCount,
      graphNodeCount,
      auditEventCount,
      shellLoadP75Ms,
      shellLoadSamplesMs,
      idempotencyReplay: true,
      staleWriteBlocked: true,
      concurrentCasWinnerCount: 1,
      markdownXssBlocked: true,
      gfmMathMermaidRendered: true,
      roleMatrixVerified: true,
      d1BatchAtomic: true,
      seriousAccessibilityViolations: 0,
      screenshot: "artifacts/ui-smoke.png",
    }),
  );
  await activeBrowser.close();
  activeBrowser = undefined;
})().catch(async (error) => {
  if (activeBrowser) await activeBrowser.close();
  console.error(error);
  process.exitCode = 1;
});
