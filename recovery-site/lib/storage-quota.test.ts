import { describe, expect, it } from "vitest";
import { AppError } from "./contracts";
import {
  MAX_ACTIVE_ATTACHMENTS,
  assertActiveAttachmentCapacity,
} from "./storage-quota";

describe("attachment count quota", () => {
  it("allows the final available active attachment slot", () => {
    expect(() =>
      assertActiveAttachmentCapacity(MAX_ACTIVE_ATTACHMENTS - 1),
    ).not.toThrow();
  });

  it("rejects uploads and restores beyond the active attachment cap", () => {
    try {
      assertActiveAttachmentCapacity(MAX_ACTIVE_ATTACHMENTS);
      throw new Error("Expected the attachment quota to reject the request.");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("quota_exceeded");
      expect((error as AppError).details).toEqual({
        active_count: MAX_ACTIVE_ATTACHMENTS,
        incoming_count: 1,
        max_active_attachments: MAX_ACTIVE_ATTACHMENTS,
      });
    }
  });

  it("accepts an empty import and rejects an oversized attachment manifest", () => {
    expect(() => assertActiveAttachmentCapacity(0, 0)).not.toThrow();
    expect(() =>
      assertActiveAttachmentCapacity(0, MAX_ACTIVE_ATTACHMENTS + 1),
    ).toThrow(/attachment count limit/);
  });
});
