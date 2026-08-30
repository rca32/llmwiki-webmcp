import { success } from "../../../lib/contracts";
import { listKnowledgeClaims } from "../../../db/wiki-repository";
import { errorResponse, requestId } from "../../../lib/http";
import { decodeCursor, encodeCursor } from "../../../lib/pagination";
import { requireWikiSession } from "../../../lib/server-session";
import { requiredInteger, requiredUuid } from "../../../lib/validation";

export async function GET(request: Request) {
  const id = requestId("claim.list");
  try {
    const session = await requireWikiSession("can_read"),
      url = new URL(request.url),
      subjectValue = url.searchParams.get("subject_page_id"),
      sourceValue = url.searchParams.get("source_page_id"),
      subjectPageId = subjectValue
        ? requiredUuid(subjectValue, "subject_page_id")
        : null,
      sourcePageId = sourceValue
        ? requiredUuid(sourceValue, "source_page_id")
        : null,
      limit = requiredInteger(
        Number(url.searchParams.get("limit") ?? 50),
        "limit",
        1,
        100,
      ),
      scope = `claims:${session.wikiId}:${subjectPageId ?? "*"}:${sourcePageId ?? "*"}`,
      offset = decodeCursor(url.searchParams.get("cursor"), scope),
      result = await listKnowledgeClaims({
        wikiId: session.wikiId!,
        subjectPageId,
        sourcePageId,
        limit,
        offset,
      }),
      hasMore = offset + result.claims.length < result.total;
    return Response.json(
      success(
        {
          claims: result.claims,
          total: result.total,
          has_more: hasMore,
          next_cursor: hasMore
            ? encodeCursor(scope, offset + result.claims.length)
            : null,
          content_trust: "untrusted_wiki_content",
        },
        id,
      ),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}
