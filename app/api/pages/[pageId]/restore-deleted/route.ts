import { success } from "../../../../../lib/contracts";
import { restoreDeletedPage } from "../../../../../db/wiki-repository";
import {
  errorResponse,
  jsonBody,
  originFrom,
  requestId,
} from "../../../../../lib/http";
import { requireWikiSession } from "../../../../../lib/server-session";
import {
  operationId,
  optionalNullableString,
  requireObject,
  requiredInteger,
} from "../../../../../lib/validation";

type Context = { params: Promise<{ pageId: string }> };
export async function POST(request: Request, { params }: Context) {
  const id = requestId();
  try {
    const session = await requireWikiSession("can_soft_delete"),
      { pageId } = await params,
      body = requireObject(await jsonBody(request));
    const result = await restoreDeletedPage({
      wikiId: session.wikiId!,
      email: session.email,
      pageId,
      expectedVersion: requiredInteger(
        body.expected_version,
        "expected_version",
        1,
      ),
      replacementSlug: optionalNullableString(
        body.replacement_slug,
        "replacement_slug",
      ),
      operationId: operationId(body.operation_id),
      requestId: id,
      origin: originFrom(request),
    });
    return Response.json(success(result, id, result.change_set));
  } catch (error) {
    return errorResponse(error, id);
  }
}
