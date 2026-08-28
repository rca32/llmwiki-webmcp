import { describe, expect, it } from "vitest";
import {
  selectRevisionPruneCandidates,
  type RevisionRetentionRow,
} from "./revision-retention";

const now = Date.parse("2026-08-28T00:00:00.000Z");

function revision(
  version: number,
  overrides: Partial<RevisionRetentionRow> = {},
): RevisionRetentionRow {
  return {
    id: `revision-${version}`,
    page_id: "page-1",
    version,
    snapshot_object_key: null,
    save_kind: "explicit",
    is_pinned: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    covered: 1,
    ...overrides,
  };
}

function newestFirst(
  count: number,
  overrides: Partial<RevisionRetentionRow> = {},
) {
  return Array.from({ length: count }, (_, index) =>
    revision(count - index, overrides),
  );
}

describe("revision retention policy", () => {
  it("always retains the newest 100 revisions per page", () => {
    const candidates = selectRevisionPruneCandidates(newestFirst(101), now);
    expect(candidates.map((item) => item.version)).toEqual([1]);
  });

  it("never prunes pinned or uncovered revisions", () => {
    const rows = newestFirst(100);
    rows.push(revision(0, { is_pinned: 1 }));
    rows.push(revision(-1, { covered: 0 }));
    expect(selectRevisionPruneCandidates(rows, now)).toEqual([]);
  });

  it("retains explicit and WebMCP saves for 180 days", () => {
    const recent = newestFirst(100);
    recent.push(
      revision(0, {
        created_at: "2026-03-02T00:00:00.000Z",
        save_kind: "webmcp",
      }),
    );
    const expired = newestFirst(100, { page_id: "page-2" });
    expired.push(
      revision(0, {
        id: "expired-explicit",
        page_id: "page-2",
        created_at: "2026-02-28T00:00:00.000Z",
      }),
    );
    expect(
      selectRevisionPruneCandidates([...recent, ...expired], now).map(
        (item) => item.id,
      ),
    ).toEqual(["expired-explicit"]);
  });

  it("keeps one autosave per hour from day 2 through day 30", () => {
    const rows = newestFirst(100);
    rows.push(
      revision(0, {
        id: "hour-first",
        save_kind: "autosave",
        created_at: "2026-08-26T12:05:00.000Z",
      }),
      revision(-1, {
        id: "hour-second",
        save_kind: "autosave",
        created_at: "2026-08-26T12:55:00.000Z",
      }),
    );
    expect(
      selectRevisionPruneCandidates(rows, now).map((item) => item.id),
    ).toEqual(["hour-second"]);
  });

  it("keeps one autosave per day from day 31 through day 180", () => {
    const rows = newestFirst(100);
    rows.push(
      revision(0, {
        id: "day-first",
        save_kind: "autosave",
        created_at: "2026-06-01T02:00:00.000Z",
      }),
      revision(-1, {
        id: "day-second",
        save_kind: "autosave",
        created_at: "2026-06-01T23:00:00.000Z",
      }),
    );
    expect(
      selectRevisionPruneCandidates(rows, now).map((item) => item.id),
    ).toEqual(["day-second"]);
  });
});
