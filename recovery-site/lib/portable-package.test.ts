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
});
