import { AppError, success } from "../../../../lib/contracts";
import { errorResponse, jsonBody, requestId } from "../../../../lib/http";
import { requireWikiSession } from "../../../../lib/server-session";
import {
  cleanupSearchBenchmark,
  measureSearchBenchmark,
  seedSearchBenchmark,
} from "../../../../db/wiki-repository";
import {
  operationId,
  requireObject,
  requiredInteger,
  requiredString,
} from "../../../../lib/validation";
import { searchBenchmarkEnabled } from "../../../../lib/search-benchmark-policy";

export async function POST(request: Request) {
  const id = requestId("maintenance.search_benchmark");
  try {
    if (!searchBenchmarkEnabled())
      throw new AppError(
        "not_found",
        "The search benchmark is not enabled for this Site.",
        404,
      );
    const session = await requireWikiSession("can_full_backup"),
      body = requireObject(await jsonBody(request)),
      action = requiredString(body.action, "action", 4, 7),
      runId = operationId(body.run_id);
    let result;
    if (action === "cleanup")
      result = await cleanupSearchBenchmark(session.wikiId!, runId);
    else {
      const pageCount = requiredInteger(
        body.page_count ?? 10_000,
        "page_count",
        100,
        10_000,
      );
      if (action === "measure")
        result = await measureSearchBenchmark(
          session.wikiId!,
          runId,
          pageCount,
        );
      else if (action === "seed") {
        const offset = requiredInteger(body.offset, "offset", 0, pageCount - 1),
          count = requiredInteger(body.count, "count", 1, 1_000);
        if (offset + count > pageCount)
          throw new AppError(
            "validation_error",
            "The search benchmark seed range exceeds page_count.",
            400,
          );
        result = await seedSearchBenchmark(
          session.wikiId!,
          runId,
          offset,
          count,
        );
      } else
        throw new AppError(
          "validation_error",
          "action must be seed, measure, or cleanup.",
          400,
        );
    }
    return Response.json(success(result, id));
  } catch (error) {
    return errorResponse(error, id);
  }
}
