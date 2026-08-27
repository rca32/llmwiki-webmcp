import { afterEach, describe, expect, it, vi } from "vitest";
import { readTools, toolsForCapabilities, writeTools } from "./site-tools";

describe("WebMCP descriptor contract", () => {
  const tools = [...readTools(), ...writeTools()];
  it("has stable unique names", () => {
    const names = tools.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual([
      "wiki_get_context",
      "wiki_list_pages",
      "wiki_search",
      "wiki_get_page",
      "wiki_get_neighbors",
      "wiki_list_revisions",
      "wiki_create_page",
      "wiki_update_page",
      "wiki_append_page",
      "wiki_move_page",
      "wiki_link_pages",
      "wiki_restore_revision",
    ]);
  });
  it("closes every top-level input schema", () => {
    for (const tool of tools)
      expect(tool.inputSchema.additionalProperties, tool.name).toBe(false);
  });
  it("marks reads and mutations accurately", () => {
    for (const tool of readTools())
      expect(tool.annotations.readOnlyHint, tool.name).toBe(true);
    for (const tool of writeTools())
      expect(tool.annotations.readOnlyHint, tool.name).toBe(false);
  });
  it("requires concurrency and idempotency for existing-page writes", () => {
    for (const tool of writeTools().filter(
      (item) => item.name !== "wiki_create_page",
    )) {
      const required = tool.inputSchema.required as string[];
      expect(required, tool.name).toContain("expected_version");
      expect(required, tool.name).toContain("operation_id");
    }
  });

  it("forwards bounded depth to tree and neighbor APIs", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, data: {} }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await readTools()
      .find((tool) => tool.name === "wiki_list_pages")!
      .execute({ parent_id: null, depth: 2, limit: 7 });
    await readTools()
      .find((tool) => tool.name === "wiki_get_neighbors")!
      .execute({
        page_id: "11111111-1111-4111-8111-111111111111",
        depth: 2,
        limit: 9,
      });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/pages?parent_id=&depth=2&limit=7",
    );
    expect(fetchMock.mock.calls[1][0]).toContain("/neighbors?depth=2&limit=9");
  });

  it("exposes reads to viewers and mutations only to writers", () => {
    expect(
      toolsForCapabilities({ can_read: true, can_write: false }).map(
        (tool) => tool.name,
      ),
    ).toEqual(readTools().map((tool) => tool.name));
    expect(
      toolsForCapabilities({ can_read: true, can_write: true }),
    ).toHaveLength(12);
    expect(
      toolsForCapabilities({ can_read: false, can_write: false }),
    ).toHaveLength(0);
  });
});

afterEach(() => vi.unstubAllGlobals());
