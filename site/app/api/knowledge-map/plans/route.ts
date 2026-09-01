import { success } from "../../../../lib/contracts";
import { createKnowledgeMapPlan } from "../../../../db/wiki-repository";
import {
  errorResponse,
  jsonBody,
  originFrom,
  requestId,
} from "../../../../lib/http";
import { parseKnowledgeMapPatch } from "../../../../lib/knowledge-map";
import { requireWikiSession } from "../../../../lib/server-session";

export async function POST(request: Request) {
  const id = requestId("knowledge-map.plan");
  try {
    const session = await requireWikiSession("can_write"),
      patch = parseKnowledgeMapPatch(await jsonBody(request)),
      result = await createKnowledgeMapPlan({
        wikiId: session.wikiId!,
        email: session.email,
        patch,
        requestId: id,
        origin: originFrom(request),
      });
    return Response.json(success(result, id), {
      status: 201,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, id);
  }
}
