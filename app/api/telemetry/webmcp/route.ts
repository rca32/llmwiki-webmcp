import { AppError, success } from "../../../../lib/contracts";
import { errorResponse, jsonBody, requestId } from "../../../../lib/http";
import { requireWikiSession } from "../../../../lib/server-session";
import {
  requireObject,
  requiredInteger,
  requiredString,
} from "../../../../lib/validation";
import { recordWebMcpInvocation } from "../../../../db/wiki-repository";

const TOOL_NAMES = new Set([
  "wiki_get_context",
  "wiki_list_vaults",
  "wiki_switch_vault",
  "wiki_list_pages",
  "wiki_search",
  "wiki_get_page",
  "wiki_get_neighbors",
  "wiki_list_revisions",
  "wiki_create_folder",
  "wiki_create_vault",
  "wiki_create_page",
  "wiki_update_page",
  "wiki_append_page",
  "wiki_move_page",
  "wiki_link_pages",
  "wiki_restore_revision",
]);
const OUTCOMES = new Set([
  "success",
  "denied",
  "conflict",
  "validation",
  "error",
]);
const ALLOWED_FIELDS = new Set([
  "tool_name",
  "outcome",
  "latency_ms",
  "correlation_id",
]);

export async function POST(request: Request) {
  const id = requestId("telemetry.webmcp.record");
  try {
    const session = await requireWikiSession("can_read");
    const body = requireObject(await jsonBody(request));
    const unexpected = Object.keys(body).filter(
      (field) => !ALLOWED_FIELDS.has(field),
    );
    if (unexpected.length)
      throw new AppError(
        "validation_error",
        "The telemetry body contains unsupported fields.",
        400,
        { fields: unexpected },
      );
    const toolName = requiredString(body.tool_name, "tool_name", 1, 64);
    const outcome = requiredString(body.outcome, "outcome", 1, 20);
    const latencyMs = requiredInteger(
      body.latency_ms,
      "latency_ms",
      0,
      300_000,
    );
    const correlationId = requiredString(
      body.correlation_id,
      "correlation_id",
      1,
      100,
    );
    if (!TOOL_NAMES.has(toolName))
      throw new AppError(
        "validation_error",
        "tool_name is not a registered WebMCP tool.",
        400,
        { field: "tool_name" },
      );
    if (!OUTCOMES.has(outcome))
      throw new AppError("validation_error", "outcome is not supported.", 400, {
        field: "outcome",
      });
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(correlationId))
      throw new AppError(
        "validation_error",
        "correlation_id contains unsupported characters.",
        400,
        { field: "correlation_id" },
      );
    await recordWebMcpInvocation({
      wikiId: session.wikiId!,
      toolName,
      outcome,
      latencyMs,
      correlationId,
    });
    return Response.json(success({ recorded: true }, id), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, id);
  }
}
