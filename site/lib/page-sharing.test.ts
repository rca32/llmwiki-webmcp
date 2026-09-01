import { describe, expect, it } from "vitest";

import {
  buildCodexResearchPrompt,
  buildPagePermalink,
  buildWikiPermalink,
  readPagePermalink,
} from "./page-sharing";

const wikiId = "bb9a5357-07a3-42a3-8798-fc1f25271e0e";
const pageId = "aac38445-5628-4c08-9fa6-dc95638a669b";

describe("page sharing", () => {
  it("builds a stable vault-aware page link", () => {
    const link = buildPagePermalink(
      "https://wiki.example.test/?stale=1#old",
      wikiId,
      pageId,
    );
    expect(link).toBe(
      `https://wiki.example.test/?wiki=${wikiId}&page=${pageId}`,
    );
    expect(readPagePermalink(link)).toEqual({ wikiId, pageId });
  });

  it("rejects incomplete or malformed deep links", () => {
    expect(
      readPagePermalink("https://wiki.example.test/?page=nope"),
    ).toBeNull();
    expect(
      readPagePermalink(`https://wiki.example.test/?wiki=${wikiId}`),
    ).toBeNull();
  });

  it("removes a stale page target when only a vault is selected", () => {
    expect(
      buildWikiPermalink(
        `https://wiki.example.test/?wiki=old&page=${pageId}#stale`,
        wikiId,
      ),
    ).toBe(`https://wiki.example.test/?wiki=${wikiId}`);
  });

  it("creates an honest Codex handoff prompt with provenance guidance", () => {
    const link = buildPagePermalink(
      "https://wiki.example.test/",
      wikiId,
      pageId,
    );
    const prompt = buildCodexResearchPrompt("청년 민심", link);
    expect(prompt).toContain("페이지: 청년 민심");
    expect(prompt).toContain(`링크: ${link}`);
    expect(prompt).toContain("원문 URL");
    expect(prompt).toContain("반영 계획을 먼저");
  });
});
