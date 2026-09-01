import { success } from "../../../lib/contracts";
import {
  applyKnowledgeMapPatch,
  getKnowledgeMap,
} from "../../../db/wiki-repository";
import {
  errorResponse,
  jsonBody,
  originFrom,
  requestId,
} from "../../../lib/http";
import { parseKnowledgeMapPatch } from "../../../lib/knowledge-map";
import { requireWikiSession } from "../../../lib/server-session";

export async function GET() {
  const id = requestId("knowledge-map.read");
  try {
    const session = await requireWikiSession("can_read"),
      result = await getKnowledgeMap(session.wikiId!);
    return Response.json(success(result, id), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, id);
  }
}

export async function PATCH(request: Request) {
  const id = requestId("knowledge-map.manual-update");
  try {
    const session = await requireWikiSession("can_write"),
      patch = parseKnowledgeMapPatch(await jsonBody(request)),
      result = await applyKnowledgeMapPatch({
        wikiId: session.wikiId!,
        email: session.email,
        patch,
        requestId: id,
        origin: originFrom(request),
        manual: true,
      });
    return Response.json(success(result, id, result.change_set));
  } catch (error) {
    return errorResponse(error, id);
  }
}
