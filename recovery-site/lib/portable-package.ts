type JsonRecord = Record<string, unknown>;

const encoder = new TextEncoder();

function jsonBytes(value: unknown) {
  return encoder.encode(`${JSON.stringify(value, null, 2)}\n`);
}

function safeSegment(value: unknown, fallback: string) {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  const safe = normalized
    .normalize("NFKD")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return safe || fallback;
}

function markdownLabel(value: unknown) {
  return String(value ?? "Untitled").replace(/[\[\]\\]/g, "\\$&");
}

function pageDirectory(pageType: unknown) {
  if (pageType === "concept") return "concepts";
  if (pageType === "entity") return "entities";
  if (pageType === "source") return "sources";
  return "pages";
}

export function buildPortableProjection(metadataBytes: Uint8Array) {
  const metadata = JSON.parse(
    new TextDecoder().decode(metadataBytes),
  ) as JsonRecord;
  const pages = Array.isArray(metadata.pages)
    ? (metadata.pages as JsonRecord[])
    : [];
  const paths = new Map<string, string>();
  const files: Record<string, Uint8Array> = {};

  for (const page of pages) {
    const id = String(page.id ?? "page");
    const slug = safeSegment(page.slug, safeSegment(page.title, "page"));
    const filename = `${slug}-${safeSegment(id.slice(0, 8), "page")}.md`;
    const path = `wiki/${pageDirectory(page.page_type)}/${filename}`;
    paths.set(id, path);
    files[path] = encoder.encode(String(page.markdown ?? ""));
  }

  const wiki =
    metadata.wiki && typeof metadata.wiki === "object"
      ? (metadata.wiki as JsonRecord)
      : {};
  const indexLines = [
    `# ${markdownLabel(wiki.title ?? "Exported Wiki")}`,
    "",
    `Exported: ${String(metadata.exported_at ?? "unknown")}`,
    `Profile: ${String(metadata.profile ?? "portable")}`,
    "",
    "## Pages",
    "",
    ...pages.map((page) => {
      const path = paths.get(String(page.id)) ?? "";
      return `- [${markdownLabel(page.title)}](./${path.replace(/^wiki\//, "")})`;
    }),
    "",
  ];
  files["wiki/index.md"] = encoder.encode(indexLines.join("\n"));

  files["metadata/pages.json"] = jsonBytes(
    pages.map(({ markdown, ...page }) => ({
      ...page,
      file_path: paths.get(String(page.id)),
      markdown_sha256_source: "manifest-part-0",
      markdown_chars: String(markdown ?? "").length,
    })),
  );
  files["metadata/links.json"] = jsonBytes(
    Array.isArray(metadata.links) ? metadata.links : [],
  );
  files["metadata/audit-events.json"] = jsonBytes(
    Array.isArray(metadata.audit_events) ? metadata.audit_events : [],
  );
  if (
    metadata.knowledge_map &&
    typeof metadata.knowledge_map === "object" &&
    !Array.isArray(metadata.knowledge_map)
  )
    files["metadata/knowledge-map.json"] = jsonBytes(metadata.knowledge_map);
  files["metadata/backup-policy.json"] = jsonBytes({
    schema_version: metadata.schema_version,
    profile: metadata.profile,
    exported_at: metadata.exported_at,
    includes_current_pages: true,
    includes_current_attachments: true,
    includes_revision_snapshots: metadata.profile === "full",
    includes_audit_events: metadata.profile === "full",
    includes_knowledge_map: Boolean(metadata.knowledge_map),
    membership_is_reference_only: true,
  });
  files["revisions/manifest.json"] = jsonBytes(
    Array.isArray(metadata.revisions) ? metadata.revisions : [],
  );
  if (
    Array.isArray(metadata.members_reference) &&
    metadata.members_reference.length
  )
    files["metadata/members-reference.json"] = jsonBytes({
      exported_at: metadata.exported_at,
      warning:
        "Reference only. Import does not activate these memberships or roles.",
      members: metadata.members_reference,
    });

  return files;
}
