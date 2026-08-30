import { success } from "../../../../../lib/contracts";
import { appendPage } from "../../../../../db/wiki-repository";
import {
  errorResponse,
  jsonBody,
  originFrom,
  requestId,
} from "../../../../../lib/http";
import { requireWikiSession } from "../../../../../lib/server-session";
import {
  MAX_MARKDOWN,
  operationId,
  optionalNullableString,
  requireObject,
  requiredInteger,
  requiredString,
} from "../../../../../lib/validation";

type Context = { params: Promise<{ pageId: string }> };
export async function POST(request: Request, { params }: Context) {
  const id = requestId("page.append");
  try {
    const session = await requireWikiSession("can_write"),
      { pageId } = await params,
      body = requireObject(await jsonBody(request));
    const result = await appendPage({
      wikiId: session.wikiId!,
      email: session.email,
      pageId,
      expectedVersion: requiredInteger(
        body.expected_version,
        "expected_version",
        1,
      ),
      content: requiredString(body.content, "content", 1, MAX_MARKDOWN),
      section: optionalNullableString(body.section, "section"),
      operationId: operationId(body.operation_id),
      requestId: id,
      origin: originFrom(request),
    });
    return Response.json(success(result, id, result.change_set));
  } catch (error) {
    return errorResponse(error, id);
  }
}
