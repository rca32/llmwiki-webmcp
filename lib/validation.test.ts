import { describe, expect, it } from "vitest";
import {
  addRelatedWikiLink,
  appendMarkdownToSection,
  extractWikiLinks,
  linkMode,
  operationId,
  parseFrontmatter,
  slugify,
  stableJson,
} from "./validation";

describe("wiki validation", () => {
  it("normalizes safe Unicode slugs and strips path separators", () => {
    expect(slugify(" 운영 / 복구 가이드 ")).toBe("운영-복구-가이드");
  });
  it("rejects non UUID operation identifiers", () => {
    expect(() => operationId("retry-me")).toThrow(/operation_id/);
  });
  it("deduplicates wikilinks while preserving their text", () => {
    expect(extractWikiLinks("[[아키텍처]] [[아키텍처|설계]] [[운영]]")).toEqual(
      ["아키텍처", "운영"],
    );
  });
  it("stabilizes object key order for idempotency hashes", () => {
    expect(stableJson({ b: 2, a: { d: 4, c: 3 } })).toBe(
      stableJson({ a: { c: 3, d: 4 }, b: 2 }),
    );
  });
  it("parses bounded scalar and string-array frontmatter", () => {
    expect(
      parseFrontmatter(
        '---\ntags: ["webmcp", "wiki"]\ndraft: false\nweight: 3\n---\n# Page',
      ),
    ).toEqual({ tags: ["webmcp", "wiki"], draft: false, weight: 3 });
  });
  it("rejects malformed frontmatter instead of silently dropping it", () => {
    expect(() => parseFrontmatter("---\ninvalid line\n---\n# Page")).toThrow(
      /frontmatter/i,
    );
  });

  it("adds links through the requested Markdown representation", () => {
    expect(
      addRelatedWikiLink('---\ntags: ["mcp"]\n---\n\n# Source', "[[Target]]"),
    ).toContain('related: ["[[Target]]"]');
    expect(
      appendMarkdownToSection(
        "# Source\n\n## References\n\nExisting",
        "- [[Target]]",
        "References",
      ),
    ).toContain("Existing\n\n- [[Target]]");
  });

  it("replaces a recognized section empty state on first append", () => {
    const result = appendMarkdownToSection(
      "# Map\n\n## 페이지\n\n아직 처리한 뉴스가 없습니다.\n\n## Notes\n",
      "- [[News 1]]",
      "페이지",
      true,
    );
    expect(result).toContain("## 페이지\n\n- [[News 1]]");
    expect(result).not.toContain("아직 처리한 뉴스가 없습니다.");
  });

  it("rejects unsupported link modes", () => {
    expect(linkMode("append_section")).toBe("append_section");
    expect(() => linkMode("direct_index_write")).toThrow(/link_mode/);
  });
});
