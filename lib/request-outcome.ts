import type { ErrorCode } from "./contracts";

export type ApiOutcome =
  | "success"
  | "denied"
  | "conflict"
  | "validation"
  | "error";

export function apiOutcomeForError(code: ErrorCode): ApiOutcome {
  if (code === "unauthenticated" || code === "forbidden") return "denied";
  if (code === "version_conflict" || code === "idempotency_pending")
    return "conflict";
  if (
    code === "validation_error" ||
    code === "not_found" ||
    code === "quota_exceeded"
  )
    return "validation";
  return "error";
}
