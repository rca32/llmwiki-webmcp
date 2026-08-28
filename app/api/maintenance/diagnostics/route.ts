import { success } from "../../../../lib/contracts";
import { errorResponse, requestId } from "../../../../lib/http";
import { requireWikiSession } from "../../../../lib/server-session";
import {
  probeAttachmentPurge,
  probeD1AtomicBatch,
  probeMissingRevisionGuard,
  probeRevisionCompensation,
  probeWikiIsolation,
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
      wikiIsolation = await probeWikiIsolation({
        wikiId: session.wikiId!,
        email: session.email,
        requestId: id,
      }),
      missingRevisionGuard = await probeMissingRevisionGuard({
        wikiId: session.wikiId!,
        email: session.email,
        requestId: id,
      }),
      attachmentPurge = await probeAttachmentPurge({
        wikiId: session.wikiId!,
        email: session.email,
        requestId: id,
      }),
      result = {
        ...atomicity,
        revision_compensation: revisionCompensation,
        wiki_isolation: wikiIsolation,
        missing_revision_guard: missingRevisionGuard,
        attachment_purge: attachmentPurge,
      },
      healthy =
        atomicity.atomic &&
        revisionCompensation.direct_cleanup &&
        revisionCompensation.queued_repair &&
        Object.values(wikiIsolation).every(Boolean) &&
        Object.values(missingRevisionGuard).every(Boolean) &&
        Object.values(attachmentPurge).every(Boolean);
    return Response.json(success(result, id), {
      status: healthy ? 200 : 503,
    });
  } catch (error) {
    return errorResponse(error, id);
  }
}
