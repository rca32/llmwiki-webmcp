import { success } from "../../../../../../lib/contracts";
import { getRevisionSnapshot } from "../../../../../../db/wiki-repository";
import { errorResponse, requestId } from "../../../../../../lib/http";
import { requireWikiSession } from "../../../../../../lib/server-session";
import { requiredInteger } from "../../../../../../lib/validation";

type Context = { params: Promise<{ pageId: string; version: string }> };
export async function GET(_request: Request, { params }: Context) {
  const id = requestId();
  try {
    const session = await requireWikiSession("can_read"),
      { pageId, version } = await params;
    return Response.json(
      success(
        {
          revision: await getRevisionSnapshot(
            session.wikiId!,
            pageId,
            requiredInteger(Number(version), "version", 1),
          ),
        },
        id,
      ),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}
