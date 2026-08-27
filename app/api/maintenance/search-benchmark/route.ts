import { AppError, success } from "../../../../lib/contracts";
import { errorResponse, jsonBody, requestId } from "../../../../lib/http";
import { requireWikiSession } from "../../../../lib/server-session";
import { runSearchBenchmark } from "../../../../db/wiki-repository";
import { requireObject, requiredInteger } from "../../../../lib/validation";

export async function POST(request: Request) {
  const id = requestId();
  try {
    if (process.env.NODE_ENV === "production")
      throw new AppError(
        "not_found",
        "The search benchmark is available only in an isolated development runtime.",
        404,
      );
    const session = await requireWikiSession("can_full_backup"),
      body = requireObject(await jsonBody(request)),
      pageCount = requiredInteger(
        body.page_count ?? 10_000,
        "page_count",
        100,
        10_000,
      ),
      result = await runSearchBenchmark(session.wikiId!, pageCount);
    return Response.json(success(result, id));
  } catch (error) {
    return errorResponse(error, id);
  }
}
