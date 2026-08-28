import { success } from "../../../lib/contracts";
import { errorResponse, requestId } from "../../../lib/http";
import { requireWikiSession } from "../../../lib/server-session";
import { listAuditEvents } from "../../../db/wiki-repository";
import { requiredInteger } from "../../../lib/validation";

export async function GET(request: Request) {
  const id = requestId("audit.list");
  try {
    const session = await requireWikiSession("can_read"),
      url = new URL(request.url),
      limit = requiredInteger(
        Number(url.searchParams.get("limit") ?? 50),
        "limit",
        1,
        200,
      );
    return Response.json(
      success({ events: await listAuditEvents(session.wikiId!, limit) }, id),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}
