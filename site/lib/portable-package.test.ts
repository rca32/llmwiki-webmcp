import { describe, expect, it } from "vitest";
import { buildPortableProjection } from "./portable-package";

describe("portable backup projection", () => {
  it("creates the documented Markdown and metadata tree without unsafe paths", () => {
    const projection = buildPortableProjection(
      new TextEncoder().encode(
        JSON.stringify({
          schema_version: 1,
          exported_at: "2026-08-28T00:00:00.000Z",
          profile: "full",
          wiki: { title: "Test Wiki" },
          pages: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              slug: "architecture",
              title: "Architecture",
              page_type: "concept",
              markdown: "# Architecture\n",
            },
            {
              id: "22222222-2222-4222-8222-222222222222",
              slug: "../escape",
              title: "Unsafe Path",
              page_type: "source",
              markdown: "# Safe bytes\n",
              source_url: "https://example.com/article",
              retrieval_status: "partial",
              retrieved_at: "2026-08-28T00:00:00.000Z",
              extraction_method: "direct-html",
              confidence: 0.7,
            },
          ],
          links: [{ source_page_id: "one", target_page_id: "two" }],
          revisions: [{ id: "revision-one", version: 1 }],
          audit_events: [{ action: "page.create" }],
          members_reference: [
            { user_email: "member@example.com", role: "viewer" },
          ],
        }),
      ),
    );

    expect(Object.keys(projection)).toEqual(
      expect.arrayContaining([
        "wiki/index.md",
        "wiki/concepts/architecture-11111111.md",
        "wiki/sources/escape-22222222.md",
        "metadata/pages.json",
        "metadata/links.json",
        "metadata/audit-events.json",
        "metadata/backup-policy.json",
        "metadata/members-reference.json",
        "revisions/manifest.json",
      ]),
    );
    expect(Object.keys(projection).every((path) => !path.includes(".."))).toBe(
      true,
    );
    expect(
      new TextDecoder().decode(
        projection["wiki/concepts/architecture-11111111.md"],
      ),
    ).toBe("# Architecture\n");
    expect(
      JSON.parse(
        new TextDecoder().decode(projection["metadata/pages.json"]),
      )[1],
    ).toMatchObject({
      source_url: "https://example.com/article",
      retrieval_status: "partial",
      retrieved_at: "2026-08-28T00:00:00.000Z",
      extraction_method: "direct-html",
      confidence: 0.7,
    });
  });

  it("omits member references when the export did not request them", () => {
    const projection = buildPortableProjection(
      new TextEncoder().encode(
        JSON.stringify({
          schema_version: 1,
          profile: "portable",
          pages: [],
          links: [],
          revisions: [],
          audit_events: [],
          members_reference: [],
        }),
      ),
    );
    expect(projection["metadata/members-reference.json"]).toBeUndefined();
  });

  it("preserves the semantic Knowledge Atlas as portable metadata", () => {
    const projection = buildPortableProjection(
      new TextEncoder().encode(
        JSON.stringify({
          schema_version: 1,
          profile: "portable",
          exported_at: "2026-09-01T00:00:00.000Z",
          wiki: { title: "Atlas" },
          pages: [],
          knowledge_map: {
            version: 2,
            overview_brief_json: JSON.stringify({
              headline: "핵심 결론",
              synthesis: "근거를 종합한 결과",
              takeaways: [],
              tensions: [],
              implications: [],
              questions: [],
            }),
            overview_brief_basis_hash: "a".repeat(64),
            topics: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                title: "시장 변화",
                insight_brief_json: JSON.stringify({ headline: "주제 결론" }),
                insight_brief_basis_hash: "b".repeat(64),
              },
            ],
            placements: [],
          },
        }),
      ),
    );
    expect(projection["metadata/knowledge-map.json"]).toBeDefined();
    const portableMap = JSON.parse(
      new TextDecoder().decode(projection["metadata/knowledge-map.json"]),
    );
    expect(portableMap.overview_brief_basis_hash).toBe("a".repeat(64));
    expect(portableMap.topics[0].insight_brief_basis_hash).toBe("b".repeat(64));
    expect(
      new TextDecoder().decode(projection["metadata/backup-policy.json"]),
    ).toContain('"includes_knowledge_map": true');
  });
});
