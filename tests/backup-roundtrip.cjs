/* eslint-disable @typescript-eslint/no-require-imports */
const { createHash, randomUUID } = require("node:crypto");
const {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, relative, resolve, sep } = require("node:path");
const { spawn } = require("node:child_process");
const { createServer } = require("node:net");

const projectRoot = resolve(__dirname, "..");
const runtimeRoot = mkdtempSync(join(tmpdir(), "liminal-wiki-roundtrip-"));
const servers = [];
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

async function startProject(root, port) {
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
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  const capture = (chunk) => {
    output = `${output}${chunk}`.slice(-20_000);
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
  const headers = new Headers(init.headers);
  headers.set("x-liminal-test-user-email", email);
  if (init.body && typeof init.body === "string")
    headers.set("content-type", "application/json");
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const envelope = await response.json().catch(() => null);
  if (!response.ok || !envelope?.ok)
    throw new Error(
      `${init.method ?? "GET"} ${path} failed (${response.status}): ${JSON.stringify(envelope)}`,
    );
  return envelope.data;
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

async function main() {
  const sourceRoot = isolatedProject("source");
  const targetRoot = isolatedProject("target");
  const [sourcePort, targetPort] = await Promise.all([freePort(), freePort()]);
  const [sourceUrl, targetUrl] = await Promise.all([
    startProject(sourceRoot, sourcePort),
    startProject(targetRoot, targetPort),
  ]);
  const sourceOwner = "roundtrip-source@sites.test";
  const targetOwner = "roundtrip-target@sites.test";

  const sourceSession = await request(
    sourceUrl,
    sourceOwner,
    "/api/session/capabilities",
  );
  await request(sourceUrl, sourceOwner, "/api/wikis", {
    method: "POST",
    body: JSON.stringify({
      title: "Round-trip source",
      expected_version: sourceSession.site_version,
    }),
  });
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

  const importSession = await request(
    targetUrl,
    targetOwner,
    "/api/import/sessions",
    { method: "POST", body: JSON.stringify({ manifest }) },
  );
  for (const part of manifest.parts) {
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
  await request(
    targetUrl,
    targetOwner,
    `/api/import/sessions/${importSession.session_id}/commit`,
    { method: "POST" },
  );

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

  console.log(
    JSON.stringify({
      profile: manifest.profile,
      requestedAttachmentBytes,
      pageCount: manifest.page_count,
      attachmentCount: manifest.attachment_count,
      revisionCount: manifest.revision_count,
      partCount: manifest.parts.length,
      checksumsVerified: true,
      pageIdsAndHierarchyPreserved: true,
      attachmentChecksumPreserved: true,
      retainedRevisionRestored: true,
      importingIdentityIsOwner: true,
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
    if (resolvedRuntime.startsWith(resolve(tmpdir()) + sep))
      rmSync(resolvedRuntime, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      });
  });
