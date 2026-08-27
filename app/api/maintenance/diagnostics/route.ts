import { success } from "../../../../lib/contracts";
import { errorResponse, requestId } from "../../../../lib/http";
import { requireWikiSession } from "../../../../lib/server-session";
import { probeD1AtomicBatch } from "../../../../db/wiki-repository";

export async function POST() {
  const id = requestId();
  try {
    const session = await requireWikiSession("can_full_backup"),
      result = await probeD1AtomicBatch({
        wikiId: session.wikiId!,
        email: session.email,
        requestId: id,
      });
    return Response.json(success(result, id), {
      status: result.atomic ? 200 : 503,
    });
  } catch (error) {
    return errorResponse(error, id);
  }
}
