import { success } from "../../../lib/contracts";
import {
  getLatestWorkspaceSyncCursor,
  listWorkspaceSyncEvents,
} from "../../../db/wiki-repository";
import { errorResponse, requestId } from "../../../lib/http";
import { requireWikiSession } from "../../../lib/server-session";
import {
  aggregateWorkspaceSyncEvents,
  decodeWorkspaceSyncCursor,
  encodeWorkspaceSyncCursor,
  fullWorkspaceSyncDelta,
} from "../../../lib/workspace-sync";

const SYNC_EVENT_LIMIT = 100;

export async function GET(request: Request) {
  const id = requestId("workspace.sync");
  try {
    const session = await requireWikiSession("can_read"),
      wikiId = session.wikiId!,
      url = new URL(request.url),
      cursor = decodeWorkspaceSyncCursor(
        url.searchParams.get("cursor"),
        wikiId,
      );

    if (!cursor) {
      const latest = await getLatestWorkspaceSyncCursor(wikiId);
      return Response.json(
        success(
          {
            wiki_id: wikiId,
            cursor: encodeWorkspaceSyncCursor(wikiId, latest),
            ...aggregateWorkspaceSyncEvents([]),
          },
          id,
        ),
        { headers: { "cache-control": "no-store" } },
      );
    }

    const { events, hasMore } = await listWorkspaceSyncEvents({
        wikiId,
        cursor,
        limit: SYNC_EVENT_LIMIT,
      }),
      latest = hasMore
        ? await getLatestWorkspaceSyncCursor(wikiId)
        : (events.at(-1) ?? cursor),
      delta = hasMore
        ? fullWorkspaceSyncDelta()
        : aggregateWorkspaceSyncEvents(events);
    return Response.json(
      success(
        {
          wiki_id: wikiId,
          cursor: encodeWorkspaceSyncCursor(wikiId, latest),
          ...delta,
        },
        id,
      ),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}
