import { success } from "../../../../lib/contracts";
import { createIngestPlan } from "../../../../db/wiki-repository";
import {
  errorResponse,
  jsonBody,
  originFrom,
  requestId,
} from "../../../../lib/http";
import { parseIngestRequest } from "../../../../lib/llm-wiki-domain";
import { requireWikiSession } from "../../../../lib/server-session";

export async function POST(request: Request) {
  const id = requestId("ingest.plan");
  try {
    const session = await requireWikiSession("can_read"),
      proposed = parseIngestRequest(await jsonBody(request)),
      result = await createIngestPlan({
        wikiId: session.wikiId!,
        email: session.email,
        request: proposed,
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
