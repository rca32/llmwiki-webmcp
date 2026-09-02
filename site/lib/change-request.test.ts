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
    webmcpPageUrl: "https://wiki.test/?wiki=wiki-123",
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
      expect(prompt).toMatch(
        /built-in browser|내장 브라우저|内蔵ブラウザ|内置浏览器/,
      );
      expect(prompt).toContain("https://wiki.test/?wiki=wiki-123");
      expect(prompt).toContain("WebMCP");
      expect(prompt).toMatch(
        /not a remote MCP server|원격 MCP 서버가 아닙니다|リモート MCP サーバーではありません|并非远程 MCP 服务器/,
      );
      expect(prompt).toContain("DOM");
      expect(prompt).toMatch(
        /make no change|아무것도 변경하지 마세요|何も変更せず|不要更改任何内容/,
      );
      expect(prompt).toContain("wiki_get_context");
      expect(prompt).toContain("wiki_get_operating_contract");
      expect(prompt.indexOf("wiki_get_context")).toBeLessThan(
        prompt.indexOf("wiki_get_operating_contract"),
      );
    },
  );

  it.each<[ChangeRequestKind, string]>([
    ["create", "wiki_plan_ingest"],
    ["revise", "wiki_update_page"],
    ["research", "wiki_apply_ingest"],
    ["verify", "wiki_get_claims"],
    ["move", "wiki_move_page"],
    ["link", "wiki_link_pages"],
    ["delete", "wiki_soft_delete_page"],
    ["restore_revision", "wiki_restore_revision"],
    ["restore_deleted", "wiki_restore_deleted_page"],
    ["refresh_insights", "wiki_apply_knowledge_map"],
    ["ingest_attachment", "wiki_plan_ingest"],
    ["custom", "wiki_search"],
  ])("adds the operation-specific workflow for %s", (kind, expectedTool) => {
    for (const language of languages) {
      const base = context(language);
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
      expect(prompt).toContain(expectedTool);
      if (kind === "restore_revision") expect(prompt).toContain("v3");
      if (kind === "delete")
        expect(prompt).toContain("Confirmation: DELETE Lakehouse decisions");
    }
  });

  it.each(["move", "link", "delete", "restore_revision", "restore_deleted"])(
    "does not add plan workflows to the direct %s operation",
    (kind) => {
      const prompt = buildChangeRequestPrompt({
        context: context("en"),
        kind: kind as ChangeRequestKind,
      });
      expect(prompt).not.toContain("wiki_plan_ingest");
      expect(prompt).not.toContain("wiki_plan_knowledge_map");
      expect(prompt).not.toContain("wiki_apply_knowledge_map");
    },
  );

  it("keeps ingest and knowledge-map plans in their own workflows", () => {
    const research = buildChangeRequestPrompt({
      context: context("en"),
      kind: "research",
    });
    const insights = buildChangeRequestPrompt({
      context: context("en"),
      kind: "refresh_insights",
    });
    expect(research).toContain("wiki_plan_ingest");
    expect(research).not.toContain("wiki_plan_knowledge_map");
    expect(insights).toContain("wiki_plan_knowledge_map");
    expect(insights).not.toContain("wiki_plan_ingest");
  });

  it("allows external research tools while reserving Wiki access for Site tools", () => {
    const prompt = buildChangeRequestPrompt({
      context: { ...context("en"), scope: "wiki", page: undefined },
      kind: "research",
      details: "Find all information about lakehouse architecture.",
    });

    expect(prompt).toContain("Use any authorized research and analysis tools");
    expect(prompt).toContain(
      "External evidence retrieval with research tools is allowed",
    );
    expect(prompt).toContain("Do not bypass the Site tools");
    expect(prompt).not.toContain("Discover and use only");
  });

  it("requires a complete source-grounded LLM Wiki workflow", () => {
    const prompt = buildChangeRequestPrompt({
      context: { ...context("en"), scope: "wiki", page: undefined },
      kind: "research",
      details: "Find all information about lakehouse architecture.",
    });

    expect(prompt).toContain("compounding, human-readable LLM Wiki");
    expect(prompt).toContain("bounded coverage checklist");
    expect(prompt).toContain("multiple canonical knowledge pages");
    expect(prompt).toContain("exactly one source record");
    expect(prompt).toContain("contradictions and superseding claims");
    expect(prompt).toContain("rather than page-type folders");
    expect(prompt).toContain("one synthesis overview");
    expect(prompt).toContain("plan-only result");
    expect(prompt).toContain("wiki_plan_ingest");
    expect(prompt).toContain("wiki_apply_ingest");
    expect(prompt).toContain("wiki_lint");
  });

  it("keeps current-page research focused on the target canonical page", () => {
    const prompt = buildChangeRequestPrompt({
      context: context("en"),
      kind: "research",
      details: "Research and expand this page.",
    });

    expect(prompt).toContain("current-page research scope");
    expect(prompt).toContain(
      "Center the synthesis on the target canonical page",
    );
    expect(prompt).toContain("only the source pages needed for its provenance");
    expect(prompt).toContain("do not create unrelated canonical sibling pages");
    expect(prompt).not.toContain("multiple canonical knowledge pages");
  });

  it.each(languages)(
    "includes the external-research boundary and LLM Wiki rules in %s",
    (language) => {
      const prompt = buildChangeRequestPrompt({
        context: { ...context(language), scope: "wiki", page: undefined },
        kind: "research",
      });

      expect(prompt).toMatch(/web search|웹 검색|Web 検索|Web 搜索/);
      expect(prompt).toMatch(
        /source page|source 페이지|source ページ|source 页面/,
      );
      expect(prompt).toMatch(/canonical/);
      expect(prompt).toMatch(/Knowledge Map/);
      expect(prompt).toContain("wiki_lint");
    },
  );

  it("does not copy page Markdown into the prompt", () => {
    const prompt = buildChangeRequestPrompt({
      context: context("en"),
      kind: "verify",
      details: "Check every citation.",
    });
    expect(prompt).not.toContain("# Lakehouse decisions");
    expect(prompt).toContain("wiki_get_page");
    expect(prompt).not.toContain("body_markdown");
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
