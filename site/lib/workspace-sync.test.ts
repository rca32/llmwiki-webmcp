import { describe, expect, it } from "vitest";
import {
  aggregateWorkspaceSyncEvents,
  decodeWorkspaceSyncCursor,
  encodeWorkspaceSyncCursor,
  fullWorkspaceSyncDelta,
  type WorkspaceSyncEvent,
} from "./workspace-sync";

function event(
  action: string,
  targetId = "page-one",
  extra: Partial<WorkspaceSyncEvent> = {},
): WorkspaceSyncEvent {
  return {
    id: crypto.randomUUID(),
    action,
    target_type: "page",
    target_id: targetId,
    metadata_json: "{}",
    created_at: "2026-09-02T00:00:00.000Z",
    ...extra,
  };
}

describe("workspace sync", () => {
  it("round-trips a wiki-scoped cursor", () => {
    const encoded = encodeWorkspaceSyncCursor("wiki-one", {
      created_at: "2026-09-02T00:00:00.000Z",
      id: "event-one",
    });
    expect(decodeWorkspaceSyncCursor(encoded, "wiki-one")).toEqual({
      created_at: "2026-09-02T00:00:00.000Z",
      id: "event-one",
    });
    expect(() => decodeWorkspaceSyncCursor(encoded, "wiki-two")).toThrow(
      /different wiki/,
    );
    expect(() => decodeWorkspaceSyncCursor("invalid", "wiki-one")).toThrow(
      /invalid/,
    );
  });

  it("aggregates page, attachment, claim, and knowledge changes", () => {
    const delta = aggregateWorkspaceSyncEvents([
      event("page.update"),
      event("attachment.upload", "attachment-one", {
        target_type: "attachment",
        attachment_page_id: "page-one",
      }),
      event("claim.create", "claim-one", {
        target_type: "claim",
        metadata_json: JSON.stringify({
          subject_page_id: "page-two",
          source_page_id: "page-three",
        }),
      }),
      event("knowledge-map.update", "wiki-one"),
    ]);
    expect(new Set(delta.change_set.pages_changed)).toEqual(
      new Set(["page-one", "page-two", "page-three"]),
    );
    expect(delta.attachments_changed).toEqual(["page-one"]);
    expect(delta.change_set).toMatchObject({
      links_changed: true,
      search_changed: true,
      graph_changed: true,
      knowledge_changed: true,
    });
    expect(delta.full_resync_required).toBe(false);
  });

  it("marks tree and deleted-page changes without refreshing the session", () => {
    const delta = aggregateWorkspaceSyncEvents([
      event("page.create", "page-created"),
      event("page.soft_delete", "page-deleted"),
    ]);
    expect(delta.change_set.tree_changed).toBe(true);
    expect(delta.deleted_pages_changed).toBe(true);
    expect(delta.session_changed).toBe(false);
  });

  it("scopes trash-empty events to dependent workspace caches", () => {
    const delta = aggregateWorkspaceSyncEvents([
      event("page.trash_empty", "wiki-one", { target_type: "wiki" }),
    ]);
    expect(delta).toMatchObject({
      deleted_pages_changed: true,
      attachments_changed: [],
      session_changed: false,
      full_resync_required: false,
      change_set: {
        pages_changed: [],
        tree_changed: true,
        links_changed: true,
        search_changed: true,
        graph_changed: true,
        knowledge_changed: true,
      },
    });
  });

  it("ignores operational audits and falls back for unknown writes", () => {
    expect(
      aggregateWorkspaceSyncEvents([event("backup.prepare")])
        .full_resync_required,
    ).toBe(false);
    expect(
      aggregateWorkspaceSyncEvents([event("future.write.action")]),
    ).toEqual(fullWorkspaceSyncDelta());
  });
});
