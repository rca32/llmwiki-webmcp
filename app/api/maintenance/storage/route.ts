import { runStorageMaintenance } from "../../../../db/wiki-repository";
import { success } from "../../../../lib/contracts";
import { errorResponse, requestId } from "../../../../lib/http";
import { requireWikiSession } from "../../../../lib/server-session";

export async function POST() {
  const id = requestId();
  try {
    const session = await requireWikiSession("can_full_backup"),
      result = await runStorageMaintenance({
        wikiId: session.wikiId!,
        email: session.email,
        requestId: id,
      });
    return Response.json(success(result, id));
  } catch (error) {
    return errorResponse(error, id);
  }
}
