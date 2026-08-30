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
  for (const fixture of staleFixtures.data.pages
    .filter((item) => /^Lifecycle (Child|Parent) \d+$/.test(item.title))
    .sort(
      (left, right) =>
        Number(right.title.includes("Child")) -
        Number(left.title.includes("Child")),
    )) {
    const cleanup = await context.request.delete(
      `${baseUrl}/api/pages/${fixture.id}`,
      {
        data: {
          expected_version: fixture.version,
          confirmation: `DELETE ${fixture.title}`,
          reason: "Stale UI lifecycle fixture cleanup",
          operation_id: crypto.randomUUID(),
        },
      },
    );
    if (!cleanup.ok())
      throw new Error(
        `Stale lifecycle cleanup failed: ${cleanup.status()} ${await cleanup.text()}`,
      );
  }
  if (staleFixtures.data.pages.some((item) => /^Lifecycle /.test(item.title)))
    await page.reload({ waitUntil: "domcontentloaded" });
  const stamp = Date.now();
  const parentTitle = `Lifecycle Parent ${stamp}`;
  const childTitle = `Lifecycle Child ${stamp}`;

  page.once("dialog", (dialog) => dialog.accept(parentTitle));
  await page.getByRole("button", { name: "새 페이지" }).click();
  await page
    .getByRole("button", { name: new RegExp(parentTitle) })
    .waitFor({ timeout: 10_000 });

  page.once("dialog", (dialog) => dialog.accept(childTitle));
  await page.getByRole("button", { name: "새 페이지" }).click();
  const childTreeButton = page.getByRole("button", {
    name: new RegExp(childTitle),
  });
  await childTreeButton.waitFor({ timeout: 10_000 });
  await page
    .locator(".workspace-breadcrumbs strong")
    .filter({ hasText: childTitle })
    .waitFor({ timeout: 10_000 });
  const childId = await page.evaluate(
    () => document.documentElement.dataset.pageId,
  );
  if (!childId) throw new Error("UI-created child page did not become active.");

  page.once("dialog", (dialog) => dialog.accept(parentTitle));
  await page.getByRole("button", { name: "페이지 이동", exact: true }).click();
  await page
    .locator(".sync-state")
    .filter({ hasText: "페이지를 이동했습니다." })
    .waitFor({ timeout: 10_000 });
  const movedPage = await context.request
    .get(`${baseUrl}/api/pages/${childId}`)
    .then((response) => response.json());
  const parentId = movedPage.data.page.parent_id;
  if (!parentId)
    throw new Error("UI move did not persist the selected parent page.");

  const autosaveMarker = `AUTOSAVE_LIFECYCLE_${stamp}`;
  await page.getByRole("button", { name: "편집", exact: true }).click();
  const autosaveResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      response.url().endsWith(`/api/pages/${childId}`) &&
      response.status() === 200,
    { timeout: 15_000 },
  );
  await page
    .getByRole("textbox", { name: "Markdown 편집기" })
    .fill(`# ${childTitle}\n\n${autosaveMarker}`);
  await autosaveResponse;
  const autosaved = await context.request
    .get(`${baseUrl}/api/pages/${childId}`)
    .then((response) => response.json());
  if (!autosaved.data.page.markdown.includes(autosaveMarker))
    throw new Error("UI autosave did not persist the editor contents.");

  const laterMarker = `LATER_LIFECYCLE_${stamp}`;
  await page
    .getByRole("textbox", { name: "Markdown 편집기" })
    .fill(`# ${childTitle}\n\n${laterMarker}`);
  await page.getByRole("button", { name: "변경 저장" }).click();
  await page
    .locator(".sync-state")
    .filter({ hasText: "방금 저장됨" })
    .waitFor({ timeout: 10_000 });
  const restoreButton = page
    .getByRole("button", { name: "이 버전 복구" })
    .first();
  await restoreButton.waitFor({ timeout: 10_000 });
  page.once("dialog", (dialog) => dialog.accept());
  await restoreButton.click();
  await page
    .locator(".sync-state")
    .filter({ hasText: /에서 복구됨/ })
    .waitFor({ timeout: 10_000 });
  const restored = await context.request
    .get(`${baseUrl}/api/pages/${childId}`)
    .then((response) => response.json());
  if (
    !restored.data.page.markdown.includes(autosaveMarker) ||
    restored.data.page.markdown.includes(laterMarker)
  )
    throw new Error("UI revision restore did not restore the prior snapshot.");

  const attachmentName = `lifecycle-${stamp}.txt`;
  await page.locator('.attachment-upload input[type="file"]').setInputFiles({
    name: attachmentName,
    mimeType: "text/plain",
    buffer: Buffer.from(`attachment ${stamp}`, "utf8"),
  });
  await page
    .locator(".sync-state")
    .filter({ hasText: "첨부 업로드됨" })
    .waitFor({ timeout: 10_000 });
  await page.getByRole("link", { name: attachmentName }).waitFor();

  await page.getByRole("button", { name: "그래프" }).click();
  const graphNode = page.locator(".graph-svg-node", { hasText: childTitle });
  await graphNode.waitFor({ timeout: 10_000 });
  await graphNode.click();
  await page.locator(".wiki-editor").waitFor();
  if (
    (await page.locator(".workspace-breadcrumbs strong").innerText()) !==
    childTitle
  )
    throw new Error("Graph node click did not open the selected page.");

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
    page.getByRole("button", { name: "이동용 백업" }).click(),
  ]);
  await download.saveAs(backupPath);
  await backupAck;
  if (!existsSync(backupPath) || statSync(backupPath).size < 100)
    throw new Error("UI portable backup did not create a usable ZIP.");
  const backupBytes = statSync(backupPath).size;
  rmSync(backupPath);

  const attachments = await context.request
    .get(`${baseUrl}/api/attachments?page_id=${childId}&include_deleted=true`)
    .then((response) => response.json());
  const uploaded = attachments.data.attachments.find(
    (attachment) => attachment.filename === attachmentName,
  );
  if (!uploaded) throw new Error("Uploaded attachment was not indexed.");
  const attachmentCleanup = await context.request.delete(
    `${baseUrl}/api/attachments/${uploaded.id}`,
    { data: { operation_id: crypto.randomUUID() } },
  );
  if (!attachmentCleanup.ok())
    throw new Error("Lifecycle attachment cleanup failed.");
  for (const fixture of [
    { id: childId, title: childTitle },
    { id: parentId, title: parentTitle },
  ]) {
    const current = await context.request
      .get(`${baseUrl}/api/pages/${fixture.id}`)
      .then((response) => response.json());
    const cleanup = await context.request.delete(
      `${baseUrl}/api/pages/${fixture.id}`,
      {
        data: {
          expected_version: current.data.page.version,
          confirmation: `DELETE ${fixture.title}`,
          reason: "UI lifecycle cleanup",
          operation_id: crypto.randomUUID(),
        },
      },
    );
    if (!cleanup.ok())
      throw new Error(
        `Lifecycle page cleanup failed: ${cleanup.status()} ${await cleanup.text()}`,
      );
  }

  if (errors.length) throw new Error(`Browser errors:\n${errors.join("\n")}`);
  console.log(
    JSON.stringify({
      uiPageCreate: true,
      uiPageMove: true,
      uiAutosave: true,
      uiRevisionRestore: true,
      uiAttachmentUpload: true,
      uiGraphNodeOpen: true,
      uiPortableExport: true,
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
