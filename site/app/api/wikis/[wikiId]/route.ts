import { AppError, success } from "../../../../lib/contracts";
import { softDeleteWiki } from "../../../../db/wiki-repository";
import { errorResponse, jsonBody, requestId } from "../../../../lib/http";
import { getWikiSession } from "../../../../lib/server-session";
import {
  operationId,
  requireObject,
  requiredString,
} from "../../../../lib/validation";

type Context = { params: Promise<{ wikiId: string }> };

export async function DELETE(request: Request, { params }: Context) {
  const id = requestId("wiki.delete");
  try {
    const session = await getWikiSession(),
      { wikiId } = await params,
      body = requireObject(await jsonBody(request));
    if (
      session.wikiId !== wikiId ||
      session.role !== "owner" ||
      !session.capabilities.can_create_wiki
    )
      throw new AppError(
        "forbidden",
        "Only the current wiki owner can delete it.",
        403,
      );
    const result = await softDeleteWiki({
      wikiId,
      email: session.email,
      confirmation: requiredString(body.confirmation, "confirmation", 1, 300),
      backupAcknowledged: body.backup_acknowledged === true,
      operationId: operationId(body.operation_id),
      requestId: id,
    });
    return Response.json(
      success(result, id, {
        pages_changed: [],
        tree_changed: true,
        links_changed: true,
        search_changed: true,
        graph_changed: true,
        knowledge_changed: true,
      }),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}
