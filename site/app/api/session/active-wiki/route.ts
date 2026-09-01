import { success } from "../../../../lib/contracts";
import { setActiveWiki } from "../../../../db/wiki-repository";
import { errorResponse, jsonBody, requestId } from "../../../../lib/http";
import { getWikiSession } from "../../../../lib/server-session";
import { requireObject, requiredString } from "../../../../lib/validation";

export async function POST(request: Request) {
  const id = requestId("session.active_wiki");
  try {
    const session = await getWikiSession();
    const body = requireObject(await jsonBody(request));
    const wiki = await setActiveWiki({
      email: session.email,
      wikiId: requiredString(body.wiki_id, "wiki_id", 36, 36),
    });
    const nextSession = await getWikiSession(),
      refreshRequired =
        session.capabilities.can_read !== nextSession.capabilities.can_read ||
        session.capabilities.can_write !== nextSession.capabilities.can_write ||
        session.capabilities.can_create_wiki !==
          nextSession.capabilities.can_create_wiki;
    return Response.json(
      success(
        {
          wiki,
          current_page_id: null,
          active_wiki_id: nextSession.wikiId,
          refresh_required: refreshRequired,
          stale_after_response: refreshRequired,
          retry_after_refetch: refreshRequired,
        },
        id,
        {
          pages_changed: [],
          tree_changed: true,
          links_changed: true,
          search_changed: true,
          graph_changed: true,
          knowledge_changed: true,
        },
      ),
      {
        headers: { "cache-control": "no-store" },
      },
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}
