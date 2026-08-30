import { success } from "../../../../../../lib/contracts";
import { applyIngestPlan } from "../../../../../../db/wiki-repository";
import {
  errorResponse,
  jsonBody,
  originFrom,
  requestId,
} from "../../../../../../lib/http";
import { requireWikiSession } from "../../../../../../lib/server-session";
import {
  operationId,
  requireObject,
  requiredString,
  requiredUuid,
} from "../../../../../../lib/validation";

type Context = { params: Promise<{ planId: string }> };
export async function POST(request: Request, { params }: Context) {
  const id = requestId("ingest.apply");
  try {
    const session = await requireWikiSession("can_write"),
      { planId } = await params,
      body = requireObject(await jsonBody(request)),
      result = await applyIngestPlan({
        wikiId: session.wikiId!,
        email: session.email,
        planId: requiredUuid(planId, "plan_id"),
        planHash: requiredString(body.plan_hash, "plan_hash", 64, 64),
        approved: body.approved === true,
        operationId: operationId(body.operation_id),
        requestId: id,
        origin: originFrom(request),
      });
    return Response.json(
      success(result, id, {
        pages_changed: Object.values(result.page_ids_by_title ?? {}),
        tree_changed: true,
        links_changed: true,
        search_changed: true,
        graph_changed: true,
      }),
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}
