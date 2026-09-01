import { AppError, success } from "../../../../../lib/contracts";
import { restoreDeletedWiki } from "../../../../../db/wiki-repository";
import { errorResponse, jsonBody, requestId } from "../../../../../lib/http";
import { getWikiSession } from "../../../../../lib/server-session";
import { operationId, requireObject } from "../../../../../lib/validation";

type Context = { params: Promise<{ wikiId: string }> };

export async function POST(request: Request, { params }: Context) {
  const id = requestId("wiki.restore");
  try {
    const session = await getWikiSession(),
      { wikiId } = await params,
      body = requireObject(await jsonBody(request));
    if (session.writeMode === "read_only")
      throw new AppError(
        "forbidden",
        "Wiki restoration is unavailable while editing is locked.",
        403,
      );
    const result = await restoreDeletedWiki({
      wikiId,
      email: session.email,
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
