import { describe, expect, it } from "vitest";
import {
  WIKI_RECOVERY_WINDOW_MS,
  isWikiRecoverable,
  wikiDeletionConfirmation,
  wikiRecoveryUntil,
} from "./wiki-lifecycle";

describe("wiki lifecycle policy", () => {
  it("requires the exact wiki title in the deletion phrase", () => {
    expect(wikiDeletionConfirmation("Research Atlas")).toBe(
      "DELETE Research Atlas",
    );
    expect(wikiDeletionConfirmation("연구 위키")).toBe("DELETE 연구 위키");
  });

  it("keeps a deleted wiki recoverable through the 30-day boundary", () => {
    const deletedAt = "2026-09-01T00:00:00.000Z",
      deletedTime = new Date(deletedAt).getTime();
    expect(wikiRecoveryUntil(deletedAt)).toBe("2026-10-01T00:00:00.000Z");
    expect(
      isWikiRecoverable(deletedAt, deletedTime + WIKI_RECOVERY_WINDOW_MS),
    ).toBe(true);
    expect(
      isWikiRecoverable(deletedAt, deletedTime + WIKI_RECOVERY_WINDOW_MS + 1),
    ).toBe(false);
  });

  it("rejects invalid and future deletion timestamps", () => {
    const now = Date.parse("2026-09-01T00:00:00.000Z");
    expect(isWikiRecoverable("not-a-date", now)).toBe(false);
    expect(isWikiRecoverable("2026-09-02T00:00:00.000Z", now)).toBe(false);
  });
});
