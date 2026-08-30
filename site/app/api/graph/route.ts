import { success } from "../../../lib/contracts";
import { getGraph } from "../../../db/wiki-repository";
import { errorResponse, requestId } from "../../../lib/http";
import { requireWikiSession } from "../../../lib/server-session";
import { requiredInteger } from "../../../lib/validation";

export async function GET(request: Request) {
  const id = requestId("graph.read");
  try {
    const session = await requireWikiSession("can_read"),
      url = new URL(request.url),
      limit = requiredInteger(
        Number(url.searchParams.get("limit") ?? 500),
        "limit",
        1,
        2000,
      );
    return Response.json(success(await getGraph(session.wikiId!, limit), id), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, id);
  }
}
