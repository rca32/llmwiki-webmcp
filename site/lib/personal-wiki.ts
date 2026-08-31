import { sha256 } from "./validation";

export function isLegacyPublicDemoSlug(value: unknown): boolean {
  return typeof value === "string" && /^demo-[0-9a-f]{8}$/.test(value);
}

export async function personalWikiIdentifiers(email: string): Promise<{
  auditId: string;
  upgradeAuditId: string;
  wikiId: string;
}> {
  const normalized = email.trim().toLowerCase();
  return {
    wikiId: uuidFromHash(await sha256(`liminal-personal-wiki:${normalized}`)),
    auditId: uuidFromHash(
      await sha256(`liminal-personal-wiki-audit:${normalized}`),
    ),
    upgradeAuditId: uuidFromHash(
      await sha256(`liminal-personal-wiki-upgrade:${normalized}`),
    ),
  };
}

function uuidFromHash(hash: string): string {
  const chars = hash.slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ["8", "9", "a", "b"][Number.parseInt(chars[16], 16) & 3];
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
