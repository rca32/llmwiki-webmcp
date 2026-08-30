import { success } from "../../../../../lib/contracts";
import { linkPages } from "../../../../../db/wiki-repository";
import {
  errorResponse,
  jsonBody,
  originFrom,
  requestId,
} from "../../../../../lib/http";
import { requireWikiSession } from "../../../../../lib/server-session";
import {
  linkMode,
  operationId,
  optionalNullableString,
  requireObject,
  requiredInteger,
  requiredString,
} from "../../../../../lib/validation";

type Context = { params: Promise<{ pageId: string }> };
export async function POST(request: Request, { params }: Context) {
  const id = requestId("page.link");
  try {
    const session = await requireWikiSession("can_write"),
      { pageId } = await params,
      body = requireObject(await jsonBody(request));
    const result = await linkPages({
      wikiId: session.wikiId!,
      email: session.email,
      sourcePageId: pageId,
      targetPageId: requiredString(
        body.target_page_id,
        "target_page_id",
        36,
        36,
      ),
      linkMode: linkMode(body.link_mode),
      section: optionalNullableString(body.section, "section"),
      expectedVersion: requiredInteger(
        body.expected_version,
        "expected_version",
        1,
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
