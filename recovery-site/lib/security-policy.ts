import type { ErrorCode } from "./contracts";

export const SECURITY_RESPONSE_HEADERS = [
  {
    key: "Content-Security-Policy",
    value: "base-uri 'self'; object-src 'none'; form-action 'self'",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
] as const;

const SAFE_ERROR_CODES = new Set<ErrorCode>([
  "unauthenticated",
  "forbidden",
  "not_found",
  "validation_error",
  "version_conflict",
  "idempotency_pending",
  "quota_exceeded",
  "retryable_storage_error",
  "internal_error",
]);

export function safeOperationalErrorTag(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error))
    return "internal_error";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && SAFE_ERROR_CODES.has(code as ErrorCode)
    ? code
    : "internal_error";
}
