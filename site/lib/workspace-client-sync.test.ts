import { describe, expect, it } from "vitest";
import {
  FULL_CLIENT_CHANGE_SET,
  clientChangeSetHasWork,
  mergeClientChangeSets,
  normalizeClientChangeSet,
} from "./workspace-client-sync";

describe("workspace client sync", () => {
  it("normalizes untrusted event details", () => {
    expect(normalizeClientChangeSet(null)).toEqual(FULL_CLIENT_CHANGE_SET);
    expect(
      normalizeClientChangeSet({
        pages_changed: ["one", 2],
        graph_changed: true,
        session_changed: "yes",
      }),
    ).toMatchObject({
      pages_changed: ["one"],
      graph_changed: true,
      session_changed: false,
    });
  });

  it("coalesces page identifiers and invalidation flags", () => {
    const merged = mergeClientChangeSets(
      normalizeClientChangeSet({
        pages_changed: ["one"],
        links_changed: true,
      }),
      normalizeClientChangeSet({
        pages_changed: ["one", "two"],
        attachments_changed: ["two"],
      }),
    );
    expect(merged.pages_changed).toEqual(["one", "two"]);
    expect(merged.attachments_changed).toEqual(["two"]);
    expect(merged.links_changed).toBe(true);
    expect(clientChangeSetHasWork(merged)).toBe(true);
  });
});
