import { success } from "../../../lib/contracts";
import { errorResponse, requestId } from "../../../lib/http";
import { requireWikiSession } from "../../../lib/server-session";
import { getOperationsSummary } from "../../../db/wiki-repository";
import { searchBenchmarkEnabled } from "../../../lib/search-benchmark-policy";

export async function GET() {
  const id = requestId("operations.summary");
  try {
    const session = await requireWikiSession("can_full_backup");
    const summary = await getOperationsSummary(session.wikiId!);
    return Response.json(
      success(
        {
          ...summary,
          search_benchmark_enabled: searchBenchmarkEnabled(),
        },
        id,
      ),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}
