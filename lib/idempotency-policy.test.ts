import { describe, expect, it } from "vitest";
import { idempotencyDisposition } from "./idempotency-policy";

const now = Date.parse("2026-08-29T00:00:00.000Z");

describe("idempotency retry policy", () => {
  it("replays a completed operation with a stored result", () => {
    expect(
      idempotencyDisposition(
        {
          status: "completed",
          resultJson: '{"page_id":"page-1"}',
          leaseExpiresAt: "2026-08-28T23:00:00.000Z",
          failureRetryable: null,
        },
        now,
      ),
    ).toBe("replay");
  });

  it("allows exactly expired pending leases to be reclaimed", () => {
    expect(
      idempotencyDisposition(
        {
          status: "pending",
          resultJson: null,
          leaseExpiresAt: "2026-08-29T00:00:00.000Z",
          failureRetryable: null,
        },
        now,
      ),
    ).toBe("reclaim");
  });

  it("keeps an unexpired pending operation locked", () => {
    expect(
      idempotencyDisposition(
        {
          status: "pending",
          resultJson: null,
          leaseExpiresAt: "2026-08-29T00:00:00.001Z",
          failureRetryable: null,
        },
        now,
      ),
    ).toBe("pending");
  });

  it("reclaims retryable failures", () => {
    expect(
      idempotencyDisposition(
        {
          status: "failed",
          resultJson: '{"code":"retryable_storage_error"}',
          leaseExpiresAt: "2026-08-29T01:00:00.000Z",
          failureRetryable: 1,
        },
        now,
      ),
    ).toBe("reclaim");
  });

  it("replays non-retryable failures as a rejection", () => {
    expect(
      idempotencyDisposition(
        {
          status: "failed",
          resultJson: '{"code":"validation_error"}',
          leaseExpiresAt: "2026-08-28T23:00:00.000Z",
          failureRetryable: 0,
        },
        now,
      ),
    ).toBe("reject_failed");
  });
});
