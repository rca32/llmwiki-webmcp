import { describe, expect, it } from "vitest";
import {
  isLegacyPublicDemoSlug,
  personalWikiIdentifiers,
} from "./personal-wiki";

describe("personal wiki onboarding", () => {
  it("derives one stable isolated vault per normalized email", async () => {
    const first = await personalWikiIdentifiers(" Person@Example.com "),
      repeated = await personalWikiIdentifiers("person@example.com"),
      other = await personalWikiIdentifiers("other@example.com");
    expect(first).toEqual(repeated);
    expect(first.wikiId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(first.wikiId).not.toBe(other.wikiId);
    expect(first.auditId).not.toBe(first.wikiId);
    expect(first.upgradeAuditId).not.toBe(first.auditId);
  });

  it("recognizes only legacy generated demo slugs", () => {
    expect(isLegacyPublicDemoSlug("demo-1234abcd")).toBe(true);
    expect(isLegacyPublicDemoSlug("personal-1234abcd")).toBe(false);
    expect(isLegacyPublicDemoSlug("demo-owner-data")).toBe(false);
  });
});
