import { getExportPart } from "../../../../db/wiki-repository";
import { errorResponse, requestId } from "../../../../lib/http";
import { requireWikiSession } from "../../../../lib/server-session";
import { completeApiRequest } from "../../../../lib/request-observability";
import { requiredInteger, requiredString } from "../../../../lib/validation";

export async function GET(request: Request) {
  const id = requestId("export.stream");
  try {
    const session = await requireWikiSession("can_export_portable"),
      url = new URL(request.url),
      runId = requiredString(
        url.searchParams.get("backup_run_id"),
        "backup_run_id",
        36,
        36,
      ),
      partNumber = requiredInteger(
        Number(url.searchParams.get("part")),
        "part",
        0,
        1_000_000,
      ),
      { part, object } = await getExportPart(
        session.wikiId!,
        runId,
        partNumber,
      );
    const response = new Response(object.body, {
      headers: {
        "content-type":
          part.kind === "metadata"
            ? "application/json"
            : part.kind === "revision"
              ? "text/markdown; charset=utf-8"
              : "application/octet-stream",
        "content-length": String(part.size_bytes),
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(part.filename.replaceAll("/", "-"))}`,
        "x-content-sha256": part.sha256,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    });
    completeApiRequest(id, "success");
    return response;
  } catch (error) {
    return errorResponse(error, id);
  }
}
