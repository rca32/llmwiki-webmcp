import { restoreAttachment } from "../../../../../db/wiki-repository";
import { success } from "../../../../../lib/contracts";
import {
  errorResponse,
  jsonBody,
  originFrom,
  requestId,
} from "../../../../../lib/http";
import { requireWikiSession } from "../../../../../lib/server-session";
import { operationId, requireObject } from "../../../../../lib/validation";

type Context = { params: Promise<{ attachmentId: string }> };
export async function POST(request: Request, { params }: Context) {
  const id = requestId("attachment.restore");
  try {
    const session = await requireWikiSession("can_manage_attachments"),
      { attachmentId } = await params,
      body = requireObject(await jsonBody(request));
    const result = await restoreAttachment({
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
