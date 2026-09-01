import { AppError, success } from "../../../../../lib/contracts";
import { setKnowledgeTopicLock } from "../../../../../db/wiki-repository";
import { errorResponse, jsonBody, requestId } from "../../../../../lib/http";
import { requireWikiSession } from "../../../../../lib/server-session";
import {
  requireObject,
  requiredInteger,
  requiredUuid,
} from "../../../../../lib/validation";

type Context = { params: Promise<{ topicId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const id = requestId("knowledge-topic.lock");
  try {
    const session = await requireWikiSession("can_write"),
      { topicId } = await params,
      body = requireObject(await jsonBody(request));
    if (typeof body.is_locked !== "boolean")
      throw new AppError(
        "validation_error",
        "is_locked must be a boolean.",
        400,
        { field: "is_locked" },
      );
    const result = await setKnowledgeTopicLock({
      wikiId: session.wikiId!,
      email: session.email,
      topicId: requiredUuid(topicId, "topic_id"),
      expectedVersion: requiredInteger(
        body.expected_version,
        "expected_version",
        0,
      ),
      locked: body.is_locked,
      requestId: id,
    });
    return Response.json(success(result, id, result.change_set));
  } catch (error) {
    return errorResponse(error, id);
  }
}
