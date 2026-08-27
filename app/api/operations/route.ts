import { success } from "../../../lib/contracts";
import { errorResponse, requestId } from "../../../lib/http";
import { requireWikiSession } from "../../../lib/server-session";
import { getOperationsSummary } from "../../../db/wiki-repository";

export async function GET() {
  const id = requestId();
  try {
    const session = await requireWikiSession("can_full_backup");
    return Response.json(
      success(await getOperationsSummary(session.wikiId!), id),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}
