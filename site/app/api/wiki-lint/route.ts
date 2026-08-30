import { success } from "../../../lib/contracts";
import { lintWiki } from "../../../db/wiki-repository";
import { errorResponse, requestId } from "../../../lib/http";
import { requireWikiSession } from "../../../lib/server-session";
import { requiredInteger } from "../../../lib/validation";

export async function GET(request: Request) {
  const id = requestId("wiki.lint");
  try {
    const session = await requireWikiSession("can_read"),
      url = new URL(request.url),
      limit = requiredInteger(
        Number(url.searchParams.get("limit") ?? 100),
        "limit",
        1,
        500,
      ),
      report = await lintWiki({ wikiId: session.wikiId!, limit });
    return Response.json(
      success(
        {
          ...report,
          content_trust: "untrusted_wiki_content",
        },
        id,
      ),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}
