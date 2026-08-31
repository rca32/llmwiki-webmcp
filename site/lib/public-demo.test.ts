import { describe, expect, it } from "vitest";
import { capabilitiesFor } from "./contracts";
import {
  isPublicDemoSlug,
  publicDemoEnabled,
  publicDemoIdentifiers,
  restrictPublicDemoCapabilities,
} from "./public-demo";

describe("public demo policy", () => {
  it("requires an explicit runtime opt-in", () => {
    expect(publicDemoEnabled("true")).toBe(true);
    expect(publicDemoEnabled("1")).toBe(true);
    expect(publicDemoEnabled("false")).toBe(false);
    expect(publicDemoEnabled(undefined)).toBe(false);
  });

  it("derives one stable isolated vault per normalized email", async () => {
    const first = await publicDemoIdentifiers(" Demo@Example.com "),
      repeated = await publicDemoIdentifiers("demo@example.com"),
      other = await publicDemoIdentifiers("other@example.com");
    expect(first).toEqual(repeated);
    expect(first.wikiId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(first.wikiId).not.toBe(other.wikiId);
    expect(first.auditId).not.toBe(first.wikiId);
  });

  it("keeps page writes but removes administrative and storage privileges", () => {
    const capabilities = restrictPublicDemoCapabilities(
      capabilitiesFor("editor"),
    );
    expect(capabilities.can_read).toBe(true);
    expect(capabilities.can_write).toBe(true);
    expect(capabilities.can_manage_members).toBe(false);
    expect(capabilities.can_manage_attachments).toBe(false);
    expect(capabilities.can_create_wiki).toBe(false);
    expect(capabilities.can_export_portable).toBe(false);
  });

  it("recognizes only generated demo slugs", () => {
    expect(isPublicDemoSlug("demo-1234abcd")).toBe(true);
    expect(isPublicDemoSlug("vault-1234abcd")).toBe(false);
    expect(isPublicDemoSlug("demo-owner-data")).toBe(false);
  });
});
