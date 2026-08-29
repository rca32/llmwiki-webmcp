export type IdempotencyRecordState = {
  status: string;
  resultJson: string | null;
  leaseExpiresAt: string;
  failureRetryable: number | null;
};

export type IdempotencyDisposition =
  | "replay"
  | "reclaim"
  | "reject_failed"
  | "pending";

export function idempotencyDisposition(
  state: IdempotencyRecordState,
  currentTimeMs = Date.now(),
): IdempotencyDisposition {
  if (state.status === "completed" && state.resultJson) return "replay";
  if (
    (state.status === "pending" &&
      new Date(state.leaseExpiresAt).getTime() <= currentTimeMs) ||
    (state.status === "failed" && state.failureRetryable === 1)
  )
    return "reclaim";
  if (state.status === "failed" && state.resultJson) return "reject_failed";
  return "pending";
}
