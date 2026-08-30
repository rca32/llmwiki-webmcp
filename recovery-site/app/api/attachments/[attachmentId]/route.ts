import {
  getAttachment,
  softDeleteAttachment,
} from "../../../../db/wiki-repository";
import { success } from "../../../../lib/contracts";
import {
  errorResponse,
  jsonBody,
  originFrom,
  requestId,
} from "../../../../lib/http";
import { requireWikiSession } from "../../../../lib/server-session";
import { completeApiRequest } from "../../../../lib/request-observability";
import { operationId, requireObject } from "../../../../lib/validation";

type Context = { params: Promise<{ attachmentId: string }> };
export async function GET(_request: Request, { params }: Context) {
  const id = requestId("attachment.download");
  try {
    const session = await requireWikiSession("can_read"),
      { attachmentId } = await params,
      { row, data } = await getAttachment(session.wikiId!, attachmentId);
    const response = new Response(data, {
      headers: {
        "content-type": row.mime_type,
        "content-length": String(row.size_bytes),
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
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
export async function DELETE(request: Request, { params }: Context) {
  const id = requestId("attachment.delete");
  try {
    const session = await requireWikiSession("can_manage_attachments"),
      { attachmentId } = await params,
      body = requireObject(await jsonBody(request));
    const result = await softDeleteAttachment({
      wikiId: session.wikiId!,
      email: session.email,
      attachmentId,
      operationId: operationId(body.operation_id),
      requestId: id,
      origin: originFrom(request),
    });
    return Response.json(success(result, id));
  } catch (error) {
    return errorResponse(error, id);
  }
}
