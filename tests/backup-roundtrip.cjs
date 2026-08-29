/* eslint-disable @typescript-eslint/no-require-imports */
const { createHash, randomUUID } = require("node:crypto");
const {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
  symlinkSync,
  writeFileSync,
} = require("node:fs");
const { join, relative, resolve, sep } = require("node:path");
const { spawn } = require("node:child_process");
const { createServer } = require("node:net");

const projectRoot = resolve(__dirname, "..");
const ownsRuntimeParent = !process.env.WIKI_TEST_TMP;
const runtimeParent = resolve(
  process.env.WIKI_TEST_TMP || join(projectRoot, "..", ".test-runtimes"),
);
mkdirSync(runtimeParent, { recursive: true });
const runtimeRoot = mkdtempSync(join(runtimeParent, "liminal-wiki-roundtrip-"));
const servers = [];
const serverOutput = new Map();
const bytesArgument = process.argv.find((value) =>
  value.startsWith("--bytes="),
);
const requestedAttachmentBytes = bytesArgument
  ? Number(bytesArgument.slice("--bytes=".length))
  : new TextEncoder().encode("round-trip attachment checksum sentinel")
      .byteLength;
let peakRssBytes = process.memoryUsage().rss;

if (
  !Number.isSafeInteger(requestedAttachmentBytes) ||
  requestedAttachmentBytes < 1 ||
  requestedAttachmentBytes > 500 * 1024 * 1024
)
  throw new Error("--bytes must be an integer between 1 byte and 500 MB.");

function sampleMemory() {
  peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isolatedProject(name) {
  const target = join(runtimeRoot, name);
  const excluded = new Set([
    ".git",
    ".next",
    ".vinext",
    ".wrangler",
    "artifacts",
    "dist",
    "node_modules",
  ]);
  cpSync(projectRoot, target, {
    recursive: true,
    filter(source) {
      const path = relative(projectRoot, source);
      if (!path) return true;
      const first = path.split(sep)[0];
      if (excluded.has(first)) return false;
      if (first.startsWith(".env") && first !== ".env.example") return false;
      return !path.endsWith(".tsbuildinfo");
    },
  });
  symlinkSync(
    join(projectRoot, "node_modules"),
    join(target, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  return target;
}

async function freePort() {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
  });
}

async function startProject(root, port, bootstrapOwnerEmail) {
  writeFileSync(
    join(root, ".dev.vars"),
    `BOOTSTRAP_OWNER_EMAIL=${bootstrapOwnerEmail}\n`,
  );
  const cli = join(projectRoot, "node_modules", "vinext", "dist", "cli.js");
  const child = spawn(
    process.execPath,
    [cli, "dev", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "development",
        LIMINAL_DISABLE_INSPECTOR: "1",
        BOOTSTRAP_OWNER_EMAIL: bootstrapOwnerEmail,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  const capture = (chunk) => {
    output = `${output}${chunk}`.slice(-20_000);
    serverOutput.set(child, output);
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  servers.push(child);
  const baseUrl = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null)
      throw new Error(`Isolated Site exited during startup:\n${output}`);
    try {
      const response = await fetch(`${baseUrl}/api/session/capabilities`);
      if (response.ok) return baseUrl;
    } catch {
      // The listener is not ready yet.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error(`Isolated Site did not become ready:\n${output}`);
}

async function request(baseUrl, email, path, init = {}) {
  const { response, envelope } = await jsonResponse(baseUrl, email, path, init);
  if (!response.ok || !envelope?.ok)
    throw new Error(
      `${init.method ?? "GET"} ${path} failed (${response.status}): ${JSON.stringify(envelope)}\nRecent isolated Site output:\n${[...serverOutput.values()].join("\n--- isolated Site ---\n")}`,
    );
  return envelope.data;
}

async function jsonResponse(baseUrl, email, path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-liminal-test-user-email", email);
  if (init.body && typeof init.body === "string")
    headers.set("content-type", "application/json");
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const envelope = await response.json().catch(() => null);
  return { response, envelope };
}

async function rawRequest(baseUrl, email, path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-liminal-test-user-email", email);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  if (!response.ok)
    throw new Error(
      `${init.method ?? "GET"} ${path} failed (${response.status}): ${await response.text()}`,
    );
  return response;
}

async function importBackupThroughUi(baseUrl, email, packagePath) {
  const { chromium } = require("playwright");
  const localChrome =
    process.env.CHROME_PATH ||
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(localChrome) ? { executablePath: localChrome } : {}),
  });
  const errors = [];
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: "block",
      extraHTTPHeaders: { "x-liminal-test-user-email": email },
    });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        !message.text().startsWith("Failed to load resource:")
      )
        errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    const restoreButton = page.getByRole("button", { name: "백업에서 복원" });
    await restoreButton.waitFor();
    const chooserPromise = page.waitForEvent("filechooser");
    await restoreButton.click();
    const chooser = await chooserPromise;
    page.once("dialog", (dialog) => dialog.accept());
    await chooser.setFiles(packagePath);
    await page.waitForFunction(
      () =>
        Boolean(
          document.querySelector(".page-tree .tree-item") ||
            document.querySelector(".conflict-banner"),
        ),
      undefined,
      { timeout: 120_000 },
    );
    const restoredTree = page.locator(".page-tree .tree-item").first();
    if (!(await restoredTree.isVisible())) {
      const messageText = (
        await page.locator(".conflict-banner").innerText()
      ).trim();
      if (messageText === "빈 Site에 백업을 복원했습니다.")
        await restoredTree.waitFor({ timeout: 30_000 });
      else
        throw new Error(
          `UI import failed: ${messageText}\nBrowser errors: ${errors.join(" | ")}`,
        );
    }
    if (errors.length)
      throw new Error(`UI import browser errors:\n${errors.join("\n")}`);
    await context.close();
  } finally {
    await browser.close();
  }
}

function writeBackupPackage(manifest, partPaths, packagePath) {
  const { zipSync, strToU8 } = require("fflate");
  const files = { "manifest.json": strToU8(JSON.stringify(manifest)) };
  for (const part of manifest.parts)
    files[part.filename] = new Uint8Array(
      readFileSync(partPaths.get(part.number)),
    );
  writeFileSync(packagePath, zipSync(files, { level: 0 }));
}

async function main() {
  const sourceRoot = isolatedProject("source");
  const targetRoot = isolatedProject("target");
  const sourceOwner = "roundtrip-source@sites.test";
  const targetOwner = "roundtrip-target@sites.test";
  const [sourcePort, targetPort] = await Promise.all([freePort(), freePort()]);
  const sourceUrl = await startProject(sourceRoot, sourcePort, sourceOwner);
  const targetUrl = await startProject(targetRoot, targetPort, targetOwner);

  const unauthorizedBootstrapEmail = "roundtrip-unauthorized@sites.test";
  const unauthorizedSourceSession = await request(
    sourceUrl,
    unauthorizedBootstrapEmail,
    "/api/session/capabilities",
  );
  if (unauthorizedSourceSession.capabilities.can_bootstrap)
    throw new Error("A non-matching identity received bootstrap capability.");
  const unauthorizedCreate = await jsonResponse(
    sourceUrl,
    unauthorizedBootstrapEmail,
    "/api/wikis",
    {
      method: "POST",
      body: JSON.stringify({
        title: "Forbidden bootstrap",
        expected_version: unauthorizedSourceSession.site_version,
      }),
    },
  );
  if (
    unauthorizedCreate.response.status !== 403 ||
    unauthorizedCreate.envelope?.error?.code !== "forbidden"
  )
    throw new Error(
      `A non-matching identity was not denied empty-Site creation (${unauthorizedCreate.response.status}).`,
    );

  const sourceSession = await request(
    sourceUrl,
    sourceOwner,
    "/api/session/capabilities",
  );
  const bootstrapAttempts = await Promise.all(
    ["Round-trip source A", "Round-trip source B"].map((title) =>
      jsonResponse(sourceUrl, sourceOwner, "/api/wikis", {
        method: "POST",
        body: JSON.stringify({
          title,
          expected_version: sourceSession.site_version,
        }),
      }),
    ),
  );
  const bootstrapStatuses = bootstrapAttempts
    .map(({ response }) => response.status)
    .sort((left, right) => left - right);
  if (JSON.stringify(bootstrapStatuses) !== JSON.stringify([201, 409]))
    throw new Error(
      `Concurrent bootstrap did not produce one winner and one conflict: ${bootstrapStatuses.join(", ")}.`,
    );
  const bootstrapConflict = bootstrapAttempts.find(
    ({ response }) => response.status === 409,
  );
  if (bootstrapConflict?.envelope?.error?.code !== "validation_error")
    throw new Error(
      `Concurrent bootstrap did not return the expected rejection envelope: ${JSON.stringify(bootstrapConflict?.envelope)}.`,
    );
  const nonOwner = "roundtrip-non-owner@sites.test";
  const nonOwnerSession = await request(
    sourceUrl,
    nonOwner,
    "/api/session/capabilities",
  );
  if (nonOwnerSession.capabilities.can_bootstrap)
    throw new Error("An active wiki still advertised bootstrap capability.");
  const rebootstrap = await jsonResponse(sourceUrl, nonOwner, "/api/wikis", {
    method: "POST",
    body: JSON.stringify({
      title: "Forbidden second wiki",
      expected_version: sourceSession.site_version,
    }),
  });
  if (
    rebootstrap.response.status !== 403 ||
    rebootstrap.envelope?.error?.code !== "forbidden"
  )
    throw new Error(
      `An active wiki accepted or misreported a second bootstrap (${rebootstrap.response.status}).`,
    );
  const initialMarkdown =
    "# Round-trip sentinel\n\n[[Linked target]]\n\nversion one";
  const created = await request(sourceUrl, sourceOwner, "/api/pages", {
    method: "POST",
    body: JSON.stringify({
      title: "Round-trip sentinel",
      page_type: "note",
      markdown: initialMarkdown,
      parent_id: null,
      operation_id: randomUUID(),
    }),
  });
  const updatedMarkdown = `${initialMarkdown}\n\nversion two`;
  const updated = await request(
    sourceUrl,
    sourceOwner,
    `/api/pages/${created.page_id}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        expected_version: created.version,
        markdown: updatedMarkdown,
        change_summary: "Round-trip revision fixture",
        operation_id: randomUUID(),
      }),
    },
  );
  const attachmentFixtures = [];
  let remainingAttachmentBytes = requestedAttachmentBytes;
  for (let index = 0; remainingAttachmentBytes > 0; index++) {
    const size = Math.min(512 * 1024, remainingAttachmentBytes);
    const attachmentBytes = new Uint8Array(size);
    attachmentBytes.fill((index % 251) + 1);
    const form = new FormData();
    form.set(
      "file",
      new Blob([attachmentBytes], { type: "application/octet-stream" }),
      `roundtrip-${String(index).padStart(3, "0")}.bin`,
    );
    form.set("page_id", created.page_id);
    form.set("operation_id", randomUUID());
    const attachment = await request(
      sourceUrl,
      sourceOwner,
      "/api/attachments",
      { method: "POST", body: form },
    );
    attachmentFixtures.push({
      id: attachment.attachment_id,
      sha256: sha256(attachmentBytes),
      size,
    });
    remainingAttachmentBytes -= size;
    sampleMemory();
  }

  const { manifest } = await request(
    sourceUrl,
    sourceOwner,
    "/api/export/prepare",
    {
      method: "POST",
      body: JSON.stringify({
        profile: "full",
        include_member_reference: false,
      }),
    },
  );
  const partsDirectory = join(runtimeRoot, "parts");
  mkdirSync(partsDirectory);
  const partPaths = new Map();
  for (const part of manifest.parts) {
    const response = await rawRequest(sourceUrl, sourceOwner, part.url);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== part.size_bytes || sha256(bytes) !== part.sha256)
      throw new Error(`Export checksum mismatch for ${part.filename}.`);
    const partPath = join(partsDirectory, `part-${part.number}.bin`);
    writeFileSync(partPath, bytes);
    partPaths.set(part.number, partPath);
    sampleMemory();
  }
  await request(
    sourceUrl,
    sourceOwner,
    `/api/export/${manifest.backup_run_id}/ack`,
    {
      method: "POST",
      body: JSON.stringify({
        manifest_hash: manifest.manifest_hash,
        parts: manifest.parts.map(({ number, sha256: hash }) => ({
          number,
          sha256: hash,
        })),
      }),
    },
  );

  const unauthorizedImport = await jsonResponse(
    targetUrl,
    unauthorizedBootstrapEmail,
    "/api/import/sessions",
    { method: "POST", body: JSON.stringify({ manifest }) },
  );
  if (
    unauthorizedImport.response.status !== 403 ||
    unauthorizedImport.envelope?.error?.code !== "forbidden"
  )
    throw new Error(
      `A non-matching identity was not denied empty-Site import (${unauthorizedImport.response.status}).`,
    );
  const importSession = await request(
    targetUrl,
    targetOwner,
    "/api/import/sessions",
    { method: "POST", body: JSON.stringify({ manifest }) },
  );
  const firstPart = manifest.parts[0];
  if (!firstPart || manifest.parts.length < 2)
    throw new Error("The round-trip fixture must produce at least two parts.");
  const firstPartBytes = readFileSync(partPaths.get(firstPart.number));
  const corruptedFirstPart = Buffer.from(firstPartBytes);
  corruptedFirstPart[0] ^= 0xff;
  const rejectedChecksum = await jsonResponse(
    targetUrl,
    targetOwner,
    `/api/import/sessions/${importSession.session_id}/batches?part=${firstPart.number}`,
    {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: corruptedFirstPart,
    },
  );
  if (
    rejectedChecksum.response.status !== 400 ||
    rejectedChecksum.envelope?.error?.code !== "validation_error"
  )
    throw new Error(
      `A checksum-mismatched import part was not rejected (${rejectedChecksum.response.status}).`,
    );
  const uploadPath = `/api/import/sessions/${importSession.session_id}/batches?part=${firstPart.number}`;
  const firstUpload = await jsonResponse(targetUrl, targetOwner, uploadPath, {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: firstPartBytes,
  });
  const duplicateUpload = await jsonResponse(
    targetUrl,
    targetOwner,
    uploadPath,
    {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: firstPartBytes,
    },
  );
  if (
    !firstUpload.response.ok ||
    !duplicateUpload.response.ok ||
    firstUpload.envelope?.data?.completed_batches !== 1 ||
    duplicateUpload.envelope?.data?.completed_batches !== 1
  )
    throw new Error("Duplicate import upload was not idempotent.");
  const prematureCommit = await jsonResponse(
    targetUrl,
    targetOwner,
    `/api/import/sessions/${importSession.session_id}/commit`,
    { method: "POST" },
  );
  if (
    prematureCommit.response.status !== 409 ||
    prematureCommit.envelope?.error?.code !== "validation_error"
  )
    throw new Error(
      `Import commit did not reject missing parts (${prematureCommit.response.status}).`,
    );
  for (const part of manifest.parts.slice(1)) {
    const bytes = readFileSync(partPaths.get(part.number));
    await rawRequest(
      targetUrl,
      targetOwner,
      `/api/import/sessions/${importSession.session_id}/batches?part=${part.number}`,
      {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: bytes,
      },
    );
    sampleMemory();
  }
  let commitAttempts = 0,
    commitResult;
  do {
    commitAttempts++;
    commitResult = await request(
      targetUrl,
      targetOwner,
      `/api/import/sessions/${importSession.session_id}/commit`,
      { method: "POST" },
    );
    sampleMemory();
    if (commitAttempts > Math.ceil(manifest.parts.length / 8) + 2)
      throw new Error("Resumable import commit exceeded its retry bound.");
  } while (commitResult.status === "committing");
  if (commitResult.status !== "committed")
    throw new Error(`Unexpected import commit status ${commitResult.status}.`);

  const targetSession = await request(
    targetUrl,
    targetOwner,
    "/api/session/capabilities",
  );
  if (targetSession.wiki?.role !== "owner")
    throw new Error("Importing identity was not installed as the new owner.");
  const sourcePages = (
    await request(sourceUrl, sourceOwner, "/api/pages?depth=64&limit=200")
  ).pages;
  const targetPages = (
    await request(targetUrl, targetOwner, "/api/pages?depth=64&limit=200")
  ).pages;
  const pageProjection = (pages) =>
    pages
      .map(({ id, parent_id, title, markdown, version }) => ({
        id,
        parent_id,
        title,
        markdown,
        version,
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
  if (
    JSON.stringify(pageProjection(sourcePages)) !==
    JSON.stringify(pageProjection(targetPages))
  )
    throw new Error(
      "Restored page IDs, hierarchy, content, or versions differ.",
    );
  const targetAttachments = (
    await request(targetUrl, targetOwner, "/api/attachments")
  ).attachments;
  for (const fixture of attachmentFixtures) {
    const restoredAttachment = targetAttachments.find(
      (item) => item.id === fixture.id,
    );
    if (
      !restoredAttachment ||
      restoredAttachment.sha256 !== fixture.sha256 ||
      restoredAttachment.size_bytes !== fixture.size
    )
      throw new Error(
        `Restored attachment ${fixture.id} differs from the source.`,
      );
  }
  const targetRevisions = (
    await request(
      targetUrl,
      targetOwner,
      `/api/pages/${created.page_id}/revisions?limit=20`,
    )
  ).revisions;
  if (targetRevisions.length < 2)
    throw new Error("Full backup did not restore the retained revisions.");
  await request(
    targetUrl,
    targetOwner,
    `/api/pages/${created.page_id}/restore`,
    {
      method: "POST",
      body: JSON.stringify({
        expected_version: updated.version,
        restore_version: created.version,
        operation_id: randomUUID(),
      }),
    },
  );
  const restoredPage = (
    await request(targetUrl, targetOwner, `/api/pages/${created.page_id}`)
  ).page;
  if (restoredPage.markdown !== initialMarkdown)
    throw new Error(
      "A restored full-backup revision did not reproduce its body.",
    );

  let uiEmptySiteImport = "skipped_for_large_fixture";
  if (requestedAttachmentBytes <= 1024 * 1024) {
    const uiTargetRoot = isolatedProject("ui-target"),
      uiTargetOwner = "roundtrip-ui-target@sites.test",
      uiTargetPort = await freePort(),
      uiTargetUrl = await startProject(
        uiTargetRoot,
        uiTargetPort,
        uiTargetOwner,
      ),
      packagePath = join(runtimeRoot, "full-backup-ui-import.zip");
    writeBackupPackage(manifest, partPaths, packagePath);
    await importBackupThroughUi(uiTargetUrl, uiTargetOwner, packagePath);
    const uiSession = await request(
      uiTargetUrl,
      uiTargetOwner,
      "/api/session/capabilities",
    );
    if (uiSession.wiki?.role !== "owner")
      throw new Error("The UI importing identity was not installed as owner.");
    const uiPages = (
      await request(uiTargetUrl, uiTargetOwner, "/api/pages?depth=64&limit=200")
    ).pages;
    if (
      JSON.stringify(pageProjection(sourcePages)) !==
      JSON.stringify(pageProjection(uiPages))
    )
      throw new Error("The browser UI import changed page content or IDs.");
    const uiAttachments = (
      await request(uiTargetUrl, uiTargetOwner, "/api/attachments")
    ).attachments;
    for (const fixture of attachmentFixtures) {
      const restoredAttachment = uiAttachments.find(
        (item) => item.id === fixture.id,
      );
      if (
        !restoredAttachment ||
        restoredAttachment.sha256 !== fixture.sha256 ||
        restoredAttachment.size_bytes !== fixture.size
      )
        throw new Error(
          `UI-restored attachment ${fixture.id} differs from the source.`,
        );
    }
    const uiRevisions = (
      await request(
        uiTargetUrl,
        uiTargetOwner,
        `/api/pages/${created.page_id}/revisions?limit=20`,
      )
    ).revisions;
    if (uiRevisions.length < 2)
      throw new Error("The browser UI import omitted retained revisions.");
    uiEmptySiteImport = "verified";
  }

  console.log(
    JSON.stringify({
      profile: manifest.profile,
      requestedAttachmentBytes,
      pageCount: manifest.page_count,
      attachmentCount: manifest.attachment_count,
      revisionCount: manifest.revision_count,
      partCount: manifest.parts.length,
      commitAttempts,
      checksumsVerified: true,
      pageIdsAndHierarchyPreserved: true,
      attachmentChecksumPreserved: true,
      retainedRevisionRestored: true,
      importingIdentityIsOwner: true,
      bootstrapOwnerMatchVerified: true,
      unauthorizedEmptySiteImportBlocked: true,
      bootstrapCasWinnerCount: 1,
      activeWikiRebootstrapBlocked: true,
      checksumMismatchRejected: true,
      duplicateBatchIdempotent: true,
      missingBatchCommitRejected: true,
      uiEmptySiteImport,
      diskBackedParts: true,
      peakCoordinatorRssMiB: Math.ceil(peakRssBytes / 1024 / 1024),
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const server of servers) {
      if (server.exitCode === null) server.kill();
    }
    await Promise.all(
      servers.map(
        (server) =>
          new Promise((resolveExit) => {
            if (server.exitCode !== null) return resolveExit();
            server.once("exit", resolveExit);
            setTimeout(resolveExit, 5_000);
          }),
      ),
    );
    const resolvedRuntime = resolve(runtimeRoot);
    if (resolvedRuntime.startsWith(runtimeParent + sep)) {
      let cleanupError;
      for (let attempt = 0; attempt < 10; attempt++)
        try {
          rmSync(resolvedRuntime, {
            recursive: true,
            force: true,
            maxRetries: 10,
            retryDelay: 100,
          });
          cleanupError = undefined;
          break;
        } catch (error) {
          cleanupError = error;
          await new Promise((resolveWait) => setTimeout(resolveWait, 500));
        }
      if (cleanupError)
        console.warn(
          `Could not remove isolated runtime ${resolvedRuntime}: ${cleanupError.code ?? "unknown"}`,
        );
    }
    if (ownsRuntimeParent && readdirSync(runtimeParent).length === 0)
      rmdirSync(runtimeParent);
  });
