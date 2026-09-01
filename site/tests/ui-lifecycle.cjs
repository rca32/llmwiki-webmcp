/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("playwright");
const { existsSync, mkdirSync, rmSync, statSync } = require("node:fs");
const { join } = require("node:path");

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
    acceptDownloads: true,
    serviceWorkers: "block",
  });
  await context.addInitScript(() => {
    window.localStorage.setItem("liminal-wiki:language", "ko");
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

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator(".tree-page-row").first().waitFor();
  const staleFixtures = await context.request
    .get(`${baseUrl}/api/pages?depth=64&limit=200`)
    .then((response) => response.json());
  for (const fixture of staleFixtures.data.pages.filter((item) =>
    /^Read-only Lifecycle \d+$/.test(item.title),
  ))
    await context.request.delete(`${baseUrl}/api/pages/${fixture.id}`, {
      data: {
        expected_version: fixture.version,
        confirmation: `DELETE ${fixture.title}`,
        reason: "Stale read-only lifecycle cleanup",
        operation_id: crypto.randomUUID(),
      },
    });
  const stamp = Date.now();
  const title = `Read-only Lifecycle ${stamp}`;
  const created = await context.request
    .post(`${baseUrl}/api/pages`, {
      data: {
        title,
        page_type: "note",
        markdown: `# ${title}\n\nInitial grounded note.`,
        parent_id: null,
        operation_id: crypto.randomUUID(),
      },
    })
    .then(async (response) => {
      if (!response.ok())
        throw new Error(`Fixture create failed: ${await response.text()}`);
      return (await response.json()).data;
    });
  const updated = await context.request
    .patch(`${baseUrl}/api/pages/${created.page_id}`, {
      data: {
        expected_version: created.version,
        markdown: `# ${title}\n\nUpdated grounded note.`,
        change_summary: "Lifecycle revision fixture",
        operation_id: crypto.randomUUID(),
      },
    })
    .then(async (response) => {
      if (!response.ok())
        throw new Error(`Fixture update failed: ${await response.text()}`);
      return (await response.json()).data;
    });
  const attachmentName = `read-only-${stamp}.txt`;
  const attachment = await context.request
    .post(`${baseUrl}/api/attachments`, {
      multipart: {
        page_id: created.page_id,
        operation_id: crypto.randomUUID(),
        file: {
          name: attachmentName,
          mimeType: "text/plain",
          buffer: Buffer.from(`attachment ${stamp}`, "utf8"),
        },
      },
    })
    .then(async (response) => {
      if (!response.ok())
        throw new Error(`Fixture attachment failed: ${await response.text()}`);
      return (await response.json()).data;
    });

  await page.reload({ waitUntil: "domcontentloaded" });
  const treeButton = page.locator(".tree-file-open").filter({ hasText: title });
  await treeButton.waitFor({ timeout: 10_000 });
  await treeButton.click();
  await page
    .locator(".editor-title-copy h1")
    .filter({ hasText: title })
    .waitFor();
  await page
    .locator(".markdown-preview")
    .filter({ hasText: "Updated grounded note." })
    .waitFor();

  for (const selector of [
    ".markdown-editor",
    ".editor-mode-switch",
    '.attachment-upload input[type="file"]',
    '[draggable="true"]',
    ".move-tree",
    ".conflict-resolver",
  ])
    if ((await page.locator(selector).count()) !== 0)
      throw new Error(`Direct mutation UI remains visible: ${selector}`);
  for (const label of ["편집", "변경 저장", "페이지 이동", "페이지 삭제"])
    if (
      (await page.getByRole("button", { name: label, exact: true }).count()) !==
      0
    )
      throw new Error(`Direct mutation action remains visible: ${label}`);

  await page.getByRole("link", { name: attachmentName }).waitFor();
  if (
    (await page
      .getByRole("button", { name: `${attachmentName} 삭제` })
      .count()) !== 0
  )
    throw new Error("Attachment deletion is still exposed in the human UI.");

  const requestAction = page.getByRole("button", {
    name: "변경 요청",
    exact: true,
  });
  if ((await requestAction.count()) !== 1)
    throw new Error(
      "Documents must expose exactly one contextual request action.",
    );
  await requestAction.click();
  const requestDialog = page.getByRole("dialog", { name: "위키 변경 요청" });
  await requestDialog.waitFor();
  await requestDialog.getByRole("combobox").last().selectOption("move");
  await requestDialog
    .getByRole("textbox")
    .fill("이 문서를 의사결정 폴더로 이동해 주세요.");
  await requestDialog.locator("summary").click();
  const movePrompt = await requestDialog.locator("pre").innerText();
  if (
    !movePrompt.includes(created.page_id) ||
    !movePrompt.includes(`version: ${updated.version}`) ||
    !movePrompt.includes("실제 폴더 위치만 변경") ||
    !movePrompt.includes("wiki_get_neighbors")
  )
    throw new Error(
      "The page move request did not preserve its exact context.",
    );
  await page.keyboard.press("Escape");

  const restoreRequest = page
    .getByRole("button", { name: "복원 요청" })
    .first();
  await restoreRequest.waitFor();
  await restoreRequest.click();
  const restoreDialog = page.getByRole("dialog", { name: "위키 변경 요청" });
  await restoreDialog.locator("summary").click();
  const restorePrompt = await restoreDialog.locator("pre").innerText();
  if (
    !restorePrompt.includes("복원할 버전") ||
    !restorePrompt.includes("wiki_restore_revision")
  )
    throw new Error(
      "Revision history did not open a prefilled restore request.",
    );
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "연결 보기", exact: true }).click();
  const graphNode = page.getByRole("button", { name: `${title} 문서` });
  await graphNode.waitFor({ state: "attached", timeout: 10_000 });
  await graphNode.evaluate((element) => element.click());
  await page.locator(".graph-preview-panel").waitFor();
  await page.getByRole("button", { name: "문서 열기" }).click();
  await page
    .locator(".markdown-preview")
    .filter({ hasText: "Updated grounded note." })
    .waitFor();

  await page.locator("summary.topbar-icon-button").click();
  await page.getByRole("button", { name: "백업", exact: true }).click();
  await page.locator(".operations-stage").waitFor();
  const artifactsDir = join(process.cwd(), "artifacts");
  mkdirSync(artifactsDir, { recursive: true });
  const backupPath = join(artifactsDir, "ui-lifecycle-portable.zip");
  const backupAck = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/api\/export\/[^/]+\/ack$/.test(response.url()) &&
      response.status() === 200,
    { timeout: 30_000 },
  );
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30_000 }),
    page.getByRole("button", { name: "일반 백업", exact: true }).click(),
  ]);
  await download.saveAs(backupPath);
  await backupAck;
  if (!existsSync(backupPath) || statSync(backupPath).size < 100)
    throw new Error("UI portable backup did not create a usable ZIP.");
  const backupBytes = statSync(backupPath).size;
  rmSync(backupPath);

  await context.request.delete(
    `${baseUrl}/api/attachments/${attachment.attachment_id}`,
    { data: { operation_id: crypto.randomUUID() } },
  );
  const cleanup = await context.request.delete(
    `${baseUrl}/api/pages/${created.page_id}`,
    {
      data: {
        expected_version: updated.version,
        confirmation: `DELETE ${title}`,
        reason: "Read-only UI lifecycle cleanup",
        operation_id: crypto.randomUUID(),
      },
    },
  );
  if (!cleanup.ok())
    throw new Error(`Lifecycle cleanup failed: ${await cleanup.text()}`);

  if (errors.length) throw new Error(`Browser errors:\n${errors.join("\n")}`);
  console.log(
    JSON.stringify({
      readOnlyDocument: true,
      contextualRequest: true,
      revisionRestoreRequest: true,
      attachmentDownloadOnly: true,
      graphNodeOpen: true,
      portableExport: true,
      portableBackupBytes: backupBytes,
    }),
  );
  await activeBrowser.close();
  activeBrowser = undefined;
})().catch(async (error) => {
  if (activeBrowser) await activeBrowser.close();
  console.error(error);
  process.exitCode = 1;
});
