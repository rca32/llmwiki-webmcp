import { emptyTrash, getTrashSummary } from "../../../db/wiki-repository";
import { success } from "../../../lib/contracts";
import {
  errorResponse,
  jsonBody,
  originFrom,
  requestId,
} from "../../../lib/http";
import { requireWikiSession } from "../../../lib/server-session";
import {
  operationId,
  requireObject,
  requiredString,
} from "../../../lib/validation";

export async function GET() {
  const id = requestId("trash.read");
  try {
    const session = await requireWikiSession("can_empty_trash");
    return Response.json(success(await getTrashSummary(session.wikiId!), id), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, id);
  }
}

export async function DELETE(request: Request) {
  const id = requestId("trash.empty");
  try {
    const session = await requireWikiSession("can_empty_trash"),
      body = requireObject(await jsonBody(request)),
      result = await emptyTrash({
        wikiId: session.wikiId!,
        email: session.email,
        trashToken: requiredString(body.trash_token, "trash_token", 64, 64),
        confirmation: requiredString(body.confirmation, "confirmation", 1, 300),
        operationId: operationId(body.operation_id),
        requestId: id,
        origin: originFrom(request),
      });
    return Response.json(success(result, id, result.change_set));
  } catch (error) {
    return errorResponse(error, id);
  }
}
