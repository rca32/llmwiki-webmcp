import { AppError } from "./contracts";

export const MAX_ACTIVE_ATTACHMENTS = 200;

export function assertActiveAttachmentCapacity(
  activeCount: number,
  incomingCount = 1,
) {
  if (
    !Number.isSafeInteger(activeCount) ||
    activeCount < 0 ||
    !Number.isSafeInteger(incomingCount) ||
    incomingCount < 0 ||
    activeCount + incomingCount > MAX_ACTIVE_ATTACHMENTS
  )
    throw new AppError(
      "quota_exceeded",
      "The active attachment count limit would be exceeded.",
      413,
      {
        active_count: Math.max(0, Math.trunc(activeCount || 0)),
        incoming_count: Math.max(0, Math.trunc(incomingCount || 0)),
        max_active_attachments: MAX_ACTIVE_ATTACHMENTS,
      },
    );
}
