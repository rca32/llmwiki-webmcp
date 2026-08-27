import { acknowledgeExport } from "../../../../../db/wiki-repository";
import { AppError, success } from "../../../../../lib/contracts";
import { errorResponse, jsonBody, requestId } from "../../../../../lib/http";
import { requireWikiSession } from "../../../../../lib/server-session";
import {
  requireObject,
  requiredInteger,
  requiredString,
} from "../../../../../lib/validation";

type Context = { params: Promise<{ backupRunId: string }> };
export async function POST(request: Request, { params }: Context) {
  const id = requestId();
  try {
    const session = await requireWikiSession("can_export_portable"),
      { backupRunId } = await params,
      body = requireObject(await jsonBody(request));
    if (!Array.isArray(body.parts))
      throw new AppError("validation_error", "parts must be an array.", 400, {
        field: "parts",
      });
    const parts = body.parts.map((item, index) => {
      const part = requireObject(item);
      return {
        number: requiredInteger(
          part.number,
          `parts[${index}].number`,
          0,
          1_000_000,
        ),
        sha256: requiredString(part.sha256, `parts[${index}].sha256`, 64, 64),
      };
    });
    const result = await acknowledgeExport({
      wikiId: session.wikiId!,
      email: session.email,
      runId: requiredString(backupRunId, "backup_run_id", 36, 36),
      manifestHash: requiredString(body.manifest_hash, "manifest_hash", 64, 64),
      parts,
      requestId: id,
    });
    return Response.json(success(result, id));
  } catch (error) {
    return errorResponse(error, id);
  }
}
