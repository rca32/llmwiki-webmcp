import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SECURITY_RESPONSE_HEADERS,
  safeOperationalErrorTag,
} from "./security-policy";

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === "route.ts" ? [path] : [];
  });
}

describe("security policy", () => {
  it("sets non-breaking browser hardening headers", () => {
    const headers = new Map(
      SECURITY_RESPONSE_HEADERS.map(({ key, value }) => [
        key.toLowerCase(),
        value,
      ]),
    );
    expect(headers.get("content-security-policy")).toContain(
      "object-src 'none'",
    );
    expect(headers.get("content-security-policy")).toContain("base-uri 'self'");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("permissions-policy")).toContain("camera=()");
  });

  it("never exposes an arbitrary exception message as an operational tag", () => {
    const secret = "Bearer secret-token-in-error";
    expect(safeOperationalErrorTag(new Error(secret))).toBe("internal_error");
    expect(
      safeOperationalErrorTag({
        code: "retryable_storage_error",
        message: secret,
      }),
    ).toBe("retryable_storage_error");
    expect(safeOperationalErrorTag({ code: secret })).toBe("internal_error");
  });

  it("keeps a server-side session or capability gate in every API route", () => {
    const files = routeFiles(join(process.cwd(), "app", "api"));
    expect(files.length).toBeGreaterThan(20);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toMatch(
        /\b(?:requireWikiSession|requireImportAuthority|getWikiSession)\s*\(/,
      );
    }
  });
});
