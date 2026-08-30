import { AppError, success } from "../../../lib/contracts";
import { countSearchPages, searchPages } from "../../../db/wiki-repository";
import { errorResponse, jsonBody, requestId } from "../../../lib/http";
import { completeApiRequest } from "../../../lib/request-observability";
import { requireWikiSession } from "../../../lib/server-session";
import { decodeCursor, encodeCursor } from "../../../lib/pagination";
import {
  PAGE_TYPES,
  pageType,
  requireObject,
  requiredInteger,
  requiredString,
} from "../../../lib/validation";

export async function POST(request: Request) {
  const id = requestId("search.query");
  try {
    const session = await requireWikiSession("can_read");
    const body = requireObject(await jsonBody(request));
    const types = Array.isArray(body.page_types)
      ? body.page_types.map(pageType)
      : PAGE_TYPES;
    const limit =
        body.limit === undefined
          ? 10
          : requiredInteger(body.limit, "limit", 1, 100),
      query = requiredString(body.query, "query", 1, 500),
      scope = `search:${session.wikiId}:${query}:${types.join(",")}`,
      offset = decodeCursor(
        typeof body.cursor === "string" ? body.cursor : null,
        scope,
      ),
      [results, total] = await Promise.all([
        searchPages(session.wikiId!, query, types, limit, offset),
        countSearchPages(session.wikiId!, query, types),
      ]),
      hasMore = offset + results.length < total;
    completeApiRequest(id, "success", { resultCount: results.length });
    return Response.json(
      success(
        {
          results,
          total,
          has_more: hasMore,
          next_cursor: hasMore
            ? encodeCursor(scope, offset + results.length)
            : null,
        },
        id,
      ),
      {
        headers: { "cache-control": "no-store" },
      },
    );
  } catch (error) {
    return errorResponse(
      error instanceof AppError
        ? error
        : new AppError(
            "retryable_storage_error",
            "Wiki search is temporarily unavailable.",
            503,
            {
              next_action:
                "Retry this search once. If it still fails, use wiki_list_pages and the returned request_id for support.",
            },
            true,
          ),
      id,
    );
  }
}
