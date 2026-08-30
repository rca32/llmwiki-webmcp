import { describe, expect, it } from "vitest";
import { apiOutcomeForError } from "./request-outcome";

describe("API request observability", () => {
  it("classifies authorization failures without retaining request content", () => {
    expect(apiOutcomeForError("unauthenticated")).toBe("denied");
    expect(apiOutcomeForError("forbidden")).toBe("denied");
  });

  it("classifies conflicts, validation failures, and server errors", () => {
    expect(apiOutcomeForError("version_conflict")).toBe("conflict");
    expect(apiOutcomeForError("idempotency_pending")).toBe("conflict");
    expect(apiOutcomeForError("validation_error")).toBe("validation");
    expect(apiOutcomeForError("quota_exceeded")).toBe("validation");
    expect(apiOutcomeForError("internal_error")).toBe("error");
    expect(apiOutcomeForError("retryable_storage_error")).toBe("error");
  });
});
