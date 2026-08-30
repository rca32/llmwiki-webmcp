import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "./pagination";

describe("cursor pagination", () => {
  it("round-trips an opaque scoped offset", () => {
    const cursor = encodeCursor("pages:vault-a:root:2", 20);
    expect(cursor).not.toContain("pages:vault-a");
    expect(decodeCursor(cursor, "pages:vault-a:root:2")).toBe(20);
  });

  it("rejects a cursor reused for another vault or query", () => {
    const cursor = encodeCursor("pages:vault-a:root:2", 20);
    expect(() => decodeCursor(cursor, "pages:vault-b:root:2")).toThrow(
      /different query/,
    );
  });
});
