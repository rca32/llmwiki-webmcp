import { success } from "../../../../../lib/contracts";
import { getNeighbors } from "../../../../../db/wiki-repository";
import { errorResponse, requestId } from "../../../../../lib/http";
import { requireWikiSession } from "../../../../../lib/server-session";
import { requiredInteger } from "../../../../../lib/validation";

type Context = { params: Promise<{ pageId: string }> };
export async function GET(request: Request, { params }: Context) {
  const id = requestId();
  try {
    const session = await requireWikiSession("can_read"),
      { pageId } = await params,
      url = new URL(request.url);
    const limit = Math.min(
        Math.max(Number(url.searchParams.get("limit") || 20), 1),
        100,
      ),
      depth = requiredInteger(
        Number(url.searchParams.get("depth") ?? 1),
        "depth",
        0,
        2,
      );
    return Response.json(
      success(
        {
          neighbors: await getNeighbors(session.wikiId!, pageId, limit, depth),
        },
        id,
      ),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}
