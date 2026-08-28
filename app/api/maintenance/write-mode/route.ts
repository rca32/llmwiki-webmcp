import { AppError, success, type WriteMode } from "../../../../lib/contracts";
import { setSiteWriteMode } from "../../../../db/wiki-repository";
import { errorResponse, jsonBody, requestId } from "../../../../lib/http";
import { requireWikiSession } from "../../../../lib/server-session";
import {
  optionalNullableString,
  requireObject,
  requiredString,
} from "../../../../lib/validation";

export async function PUT(request: Request) {
  const id = requestId();
  try {
    const session = await requireWikiSession("can_manage_members"),
      body = requireObject(await jsonBody(request)),
      requestedMode = requiredString(body.write_mode, "write_mode", 9, 10);
    if (requestedMode !== "read_write" && requestedMode !== "read_only")
      throw new AppError(
        "validation_error",
        "write_mode must be read_write or read_only.",
        400,
        { field: "write_mode" },
      );
    const writeMode = requestedMode as WriteMode,
      reason = optionalNullableString(body.reason, "reason");
    if (writeMode === "read_only" && !reason)
      throw new AppError(
        "validation_error",
        "reason is required when entering read-only mode.",
        400,
        { field: "reason" },
      );
    return Response.json(
      success(
        await setSiteWriteMode({
          wikiId: session.wikiId!,
          email: session.email,
          writeMode,
          reason,
          requestId: id,
        }),
        id,
      ),
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}
