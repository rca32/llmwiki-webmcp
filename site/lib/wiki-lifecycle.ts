export const WIKI_RECOVERY_WINDOW_MS = 30 * 86_400_000;

export function wikiDeletionConfirmation(title: string): string {
  return `DELETE ${title}`;
}

export function wikiRecoveryUntil(deletedAt: string): string {
  return new Date(
    new Date(deletedAt).getTime() + WIKI_RECOVERY_WINDOW_MS,
  ).toISOString();
}

export function isWikiRecoverable(
  deletedAt: string,
  referenceTime = Date.now(),
): boolean {
  const deletedTime = new Date(deletedAt).getTime();
  return (
    Number.isFinite(deletedTime) &&
    referenceTime >= deletedTime &&
    referenceTime - deletedTime <= WIKI_RECOVERY_WINDOW_MS
  );
}
