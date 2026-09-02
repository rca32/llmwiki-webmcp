import { AppError, type ChangeSet } from "./contracts";

export type WorkspaceSyncCursor = {
  created_at: string;
  id: string;
};

export type WorkspaceSyncEvent = WorkspaceSyncCursor & {
  action: string;
  target_type: string;
  target_id: string;
  metadata_json: string;
  attachment_page_id?: string | null;
};

export type WorkspaceSyncDelta = {
  change_set: ChangeSet;
  attachments_changed: string[];
  deleted_pages_changed: boolean;
  session_changed: boolean;
  full_resync_required: boolean;
};

type CursorPayload = WorkspaceSyncCursor & {
  v: 1;
  wiki_id: string;
};

const EMPTY_CHANGE_SET: ChangeSet = {
  pages_changed: [],
  tree_changed: false,
  links_changed: false,
  search_changed: false,
  graph_changed: false,
  knowledge_changed: false,
};

const IGNORED_ACTIONS = new Set([
  "backup.ack",
  "backup.prepare",
  "diagnostic.attachment_purge",
  "diagnostic.cross_wiki_isolation",
  "diagnostic.missing_revision_guard",
  "diagnostic.revision_compensation",
  "ingest.apply",
  "ingest.plan",
  "runtime.d1_atomicity_probe",
  "storage.maintenance",
  "wiki.contract.update",
]);

function base64UrlEncode(value: string): string {
  return btoa(unescape(encodeURIComponent(value)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string {
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return decodeURIComponent(escape(atob(padded)));
}

export function encodeWorkspaceSyncCursor(
  wikiId: string,
  cursor: WorkspaceSyncCursor | null,
): string | null {
  if (!cursor) return null;
  return base64UrlEncode(
    JSON.stringify({
      v: 1,
      wiki_id: wikiId,
      ...cursor,
    } satisfies CursorPayload),
  );
}

export function decodeWorkspaceSyncCursor(
  value: string | null | undefined,
  wikiId: string,
): WorkspaceSyncCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(base64UrlDecode(value)) as Partial<CursorPayload>;
    if (
      parsed.v !== 1 ||
      parsed.wiki_id !== wikiId ||
      typeof parsed.created_at !== "string" ||
      !Number.isFinite(Date.parse(parsed.created_at)) ||
      typeof parsed.id !== "string" ||
      !parsed.id
    )
      throw new Error("invalid cursor payload");
    return { created_at: parsed.created_at, id: parsed.id };
  } catch {
    throw new AppError(
      "validation_error",
      "cursor is invalid or belongs to a different wiki.",
      400,
      { field: "cursor" },
    );
  }
}

function safeMetadata(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function fullWorkspaceSyncDelta(): WorkspaceSyncDelta {
  return {
    change_set: {
      pages_changed: [],
      tree_changed: true,
      links_changed: true,
      search_changed: true,
      graph_changed: true,
      knowledge_changed: true,
    },
    attachments_changed: [],
    deleted_pages_changed: true,
    session_changed: true,
    full_resync_required: true,
  };
}

export function aggregateWorkspaceSyncEvents(
  events: WorkspaceSyncEvent[],
): WorkspaceSyncDelta {
  const pages = new Set<string>();
  const attachments = new Set<string>();
  const changeSet = { ...EMPTY_CHANGE_SET, pages_changed: [] as string[] };
  let deletedPagesChanged = false;
  let sessionChanged = false;
  let fullResyncRequired = false;

  for (const event of events) {
    const metadata = safeMetadata(event.metadata_json);
    switch (event.action) {
      case "page.create":
        pages.add(event.target_id);
        changeSet.tree_changed = true;
        changeSet.links_changed = true;
        changeSet.search_changed = true;
        changeSet.graph_changed = true;
        break;
      case "page.update":
      case "page.restore":
        pages.add(event.target_id);
        changeSet.links_changed = true;
        changeSet.search_changed = true;
        changeSet.graph_changed = true;
        break;
      case "page.move":
        pages.add(event.target_id);
        changeSet.tree_changed = true;
        changeSet.graph_changed = true;
        break;
      case "page.soft_delete":
      case "page.restore_deleted":
        pages.add(event.target_id);
        changeSet.tree_changed = true;
        changeSet.links_changed = true;
        changeSet.search_changed = true;
        changeSet.graph_changed = true;
        deletedPagesChanged = true;
        break;
      case "page.trash_empty":
        changeSet.tree_changed = true;
        changeSet.links_changed = true;
        changeSet.search_changed = true;
        changeSet.graph_changed = true;
        changeSet.knowledge_changed = true;
        deletedPagesChanged = true;
        break;
      case "attachment.upload":
      case "attachment.soft_delete":
      case "attachment.restore":
        if (event.attachment_page_id) attachments.add(event.attachment_page_id);
        break;
      case "claim.create":
        for (const field of ["subject_page_id", "source_page_id"])
          if (typeof metadata[field] === "string") pages.add(metadata[field]);
        changeSet.knowledge_changed = true;
        break;
      case "knowledge-map.update":
      case "knowledge-topic.lock":
        changeSet.knowledge_changed = true;
        break;
      case "member.remove":
      case "member.transfer_ownership":
      case "member.upsert":
      case "site.write_mode":
        sessionChanged = true;
        break;
      case "import.commit":
      case "personal.auto_onboard":
      case "personal.upgrade_legacy_demo":
      case "wiki.bootstrap":
      case "wiki.create":
      case "wiki.restore":
      case "wiki.soft_delete":
        fullResyncRequired = true;
        sessionChanged = true;
        break;
      default:
        if (!IGNORED_ACTIONS.has(event.action)) fullResyncRequired = true;
    }
  }

  if (fullResyncRequired) return fullWorkspaceSyncDelta();
  changeSet.pages_changed = [...pages];
  changeSet.attachments_changed = [...attachments];
  changeSet.deleted_pages_changed = deletedPagesChanged;
  changeSet.session_changed = sessionChanged;
  return {
    change_set: changeSet,
    attachments_changed: [...attachments],
    deleted_pages_changed: deletedPagesChanged,
    session_changed: sessionChanged,
    full_resync_required: false,
  };
}
