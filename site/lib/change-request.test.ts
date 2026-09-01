import { describe, expect, it } from "vitest";

import type { Language } from "../components/i18n-provider";
import {
  buildChangeRequestPrompt,
  requestKindsForScope,
  type ChangeRequestContext,
  type ChangeRequestKind,
} from "./change-request";

const languages: Language[] = ["en", "ko", "ja", "zh"];

function context(language: Language): ChangeRequestContext {
  return {
    language,
    wiki: { id: "wiki-123", title: "Architecture Wiki" },
    scope: "page",
    page: {
      id: "page-456",
      title: "Lakehouse decisions",
      pageType: "synthesis",
      path: "/Decisions/Lakehouse",
      version: 7,
      permalink: "https://wiki.test/?wiki=wiki-123&page=page-456",
    },
  };
}

describe("change request prompts", () => {
  it.each(languages)(
    "includes stable context and explicit authorization in %s",
    (language) => {
      const prompt = buildChangeRequestPrompt({
        context: context(language),
        kind: "revise",
        details: "Clarify the trade-off.",
      });
      expect(prompt).toContain("wiki-123");
      expect(prompt).toContain("page-456");
      expect(prompt).toContain("version: 7");
      expect(prompt).toContain(
        "https://wiki.test/?wiki=wiki-123&page=page-456",
      );
      expect(prompt).toContain("Clarify the trade-off.");
      expect(prompt).toMatch(/Authorization|승인|承認|授权/);
      expect(prompt).toContain("wiki_get_context");
      expect(prompt).toContain("wiki_get_operating_contract");
    },
  );

  it.each<ChangeRequestKind>([
    "delete",
    "move",
    "restore_revision",
    "restore_deleted",
    "ingest_attachment",
  ])("adds the operation-specific safeguard for %s", (kind) => {
    const base = context("en");
    const requestContext: ChangeRequestContext =
      kind === "restore_revision"
        ? { ...base, scope: "revision", restoreVersion: 3 }
        : kind === "restore_deleted"
          ? { ...base, scope: "deleted_page" }
          : kind === "ingest_attachment"
            ? { ...base, scope: "wiki", page: undefined }
            : base;
    const prompt = buildChangeRequestPrompt({
      context: requestContext,
      kind,
    });
    expect(prompt).toMatch(
      /Deletion rule|Move rule|Restore rule|Attachment rule/,
    );
    if (kind === "restore_revision") expect(prompt).toContain("v3");
  });

  it("does not copy page Markdown into the prompt", () => {
    const prompt = buildChangeRequestPrompt({
      context: context("en"),
      kind: "verify",
      details: "Check every citation.",
    });
    expect(prompt).not.toContain("# Lakehouse decisions");
    expect(prompt).toContain("wiki_get_page");
  });

  it("limits request types by target scope", () => {
    expect(requestKindsForScope("revision")).toEqual([
      "restore_revision",
      "custom",
    ]);
    expect(requestKindsForScope("deleted_page")).toEqual([
      "restore_deleted",
      "custom",
    ]);
    expect(requestKindsForScope("topic")).toContain("refresh_insights");
    expect(requestKindsForScope("page")).toEqual(
      expect.arrayContaining(["revise", "move", "delete"]),
    );
    expect(requestKindsForScope("wiki")).toEqual(
      expect.arrayContaining(["create", "ingest_attachment"]),
    );
  });
});
