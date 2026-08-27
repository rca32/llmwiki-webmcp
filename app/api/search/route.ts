import { success } from "../../../lib/contracts";
import { searchPages } from "../../../db/wiki-repository";
import { errorResponse, jsonBody, requestId } from "../../../lib/http";
import { requireWikiSession } from "../../../lib/server-session";
import {
  PAGE_TYPES,
  pageType,
  requireObject,
  requiredInteger,
  requiredString,
} from "../../../lib/validation";

export async function POST(request: Request) {
  const id = requestId();
  try {
    const session = await requireWikiSession("can_read");
    const body = requireObject(await jsonBody(request));
    const types = Array.isArray(body.page_types)
      ? body.page_types.map(pageType)
      : PAGE_TYPES;
    const limit =
      body.limit === undefined
        ? 10
        : requiredInteger(body.limit, "limit", 1, 20);
    const results = await searchPages(
      session.wikiId!,
      requiredString(body.query, "query", 1, 500),
      types,
      limit,
    );
    return Response.json(success({ results }, id), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, id);
  }
}
