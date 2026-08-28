import { success } from "../../../../lib/contracts";
import { errorResponse, requestId } from "../../../../lib/http";
import { requireWikiSession } from "../../../../lib/server-session";
import {
  probeD1AtomicBatch,
  probeRevisionCompensation,
} from "../../../../db/wiki-repository";

export async function POST() {
  const id = requestId();
  try {
    const session = await requireWikiSession("can_full_backup"),
      atomicity = await probeD1AtomicBatch({
        wikiId: session.wikiId!,
        email: session.email,
        requestId: id,
      }),
      revisionCompensation = await probeRevisionCompensation({
        wikiId: session.wikiId!,
        email: session.email,
        requestId: id,
      }),
      result = {
        ...atomicity,
        revision_compensation: revisionCompensation,
      },
      healthy =
        atomicity.atomic &&
        revisionCompensation.direct_cleanup &&
        revisionCompensation.queued_repair;
    return Response.json(success(result, id), {
      status: healthy ? 200 : 503,
    });
  } catch (error) {
    return errorResponse(error, id);
  }
}
