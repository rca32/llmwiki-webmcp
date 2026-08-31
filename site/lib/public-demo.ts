import type { Capabilities } from "./contracts";
import { sha256 } from "./validation";

export const PUBLIC_DEMO_PAGE_LIMIT = 50;
export const PUBLIC_DEMO_D1_LIMIT_BYTES = 2 * 1024 * 1024;

export function publicDemoEnabled(value: unknown): boolean {
  return value === "true" || value === "1";
}

export function isPublicDemoSlug(value: unknown): boolean {
  return typeof value === "string" && /^demo-[0-9a-f]{8}$/.test(value);
}

export async function publicDemoIdentifiers(email: string): Promise<{
  auditId: string;
  wikiId: string;
}> {
  const normalized = email.trim().toLowerCase();
  return {
    wikiId: uuidFromHash(await sha256(`liminal-public-demo:${normalized}`)),
    auditId: uuidFromHash(
      await sha256(`liminal-public-demo-audit:${normalized}`),
    ),
  };
}

export function restrictPublicDemoCapabilities(
  capabilities: Capabilities,
): Capabilities {
  return {
    ...capabilities,
    can_bootstrap: false,
    can_create_wiki: false,
    can_export_portable: false,
    can_restore: false,
    can_manage_attachments: false,
    can_soft_delete: false,
    can_manage_members: false,
    can_full_backup: false,
    can_import: false,
  };
}

function uuidFromHash(hash: string): string {
  const chars = hash.slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ["8", "9", "a", "b"][Number.parseInt(chars[16], 16) & 3];
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
