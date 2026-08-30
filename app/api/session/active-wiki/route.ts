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
    return Response.json(success({ wiki }, id), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, id);
  }
}
