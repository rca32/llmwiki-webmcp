export type RevisionRetentionRow = {
  id: string;
  page_id: string;
  version: number;
  snapshot_object_key: string | null;
  save_kind: string;
  is_pinned: number;
  created_at: string;
  covered: number;
};

export function selectRevisionPruneCandidates<T extends RevisionRetentionRow>(
  revisions: T[],
  currentTimeMs = Date.now(),
): T[] {
  const pageCounts = new Map<string, number>();
  const hourBuckets = new Set<string>();
  const dayBuckets = new Set<string>();
  const candidates: T[] = [];

  for (const revision of revisions) {
    const count = (pageCounts.get(revision.page_id) ?? 0) + 1;
    pageCounts.set(revision.page_id, count);
    if (count <= 100 || revision.is_pinned || !revision.covered) continue;

    const createdAtMs = new Date(revision.created_at).getTime();
    if (!Number.isFinite(createdAtMs)) continue;
    const ageDays = (currentTimeMs - createdAtMs) / 86_400_000;
    if (revision.save_kind === "autosave") {
      if (ageDays <= 1) continue;
      if (ageDays <= 30) {
        const bucket = `${revision.page_id}:${revision.created_at.slice(0, 13)}`;
        if (!hourBuckets.has(bucket)) {
          hourBuckets.add(bucket);
          continue;
        }
      } else if (ageDays <= 180) {
        const bucket = `${revision.page_id}:${revision.created_at.slice(0, 10)}`;
        if (!dayBuckets.has(bucket)) {
          dayBuckets.add(bucket);
          continue;
        }
      }
    } else if (ageDays <= 180) continue;
    candidates.push(revision);
  }

  return candidates;
}
