import { AppError, success } from "../../../lib/contracts";
import {
  errorResponse,
  jsonBody,
  originFrom,
  requestId,
} from "../../../lib/http";
import { getWikiSession } from "../../../lib/server-session";
import {
  bootstrapWiki,
  createWiki,
  createPage,
  listAccessibleWikis,
} from "../../../db/wiki-repository";
import {
  requireObject,
  requiredInteger,
  operationId,
  requiredString,
} from "../../../lib/validation";

export async function GET() {
  const id = requestId("wiki.list");
  try {
    const session = await getWikiSession();
    return Response.json(
      success({ wikis: await listAccessibleWikis(session.email) }, id),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}

export async function POST(request: Request) {
  const id = requestId("wiki.create");
  try {
    const session = await getWikiSession();
    const body = requireObject(await jsonBody(request));
    const title = requiredString(body.title, "title", 1, 120),
      template =
        body.template === undefined
          ? "empty"
          : requiredString(body.template, "template", 1, 20);
    if (template !== "empty" && template !== "starter")
      throw new AppError(
        "validation_error",
        "template must be empty or starter.",
        400,
        { field: "template", allowed: ["empty", "starter"] },
      );
    const wiki = session.capabilities.can_bootstrap
      ? await bootstrapWiki({
          email: session.email,
          title,
          expectedVersion: requiredInteger(
            body.expected_version,
            "expected_version",
            1,
          ),
          requestId: id,
        })
      : session.capabilities.can_create_wiki
        ? await createWiki({
            email: session.email,
            title,
            operationId: operationId(body.operation_id),
            requestId: id,
          })
        : null;
    if (!wiki)
      throw new AppError(
        "forbidden",
        "This session cannot create another vault.",
        403,
      );
    const starterPage =
      template === "starter"
        ? await createPage({
            wikiId: String(wiki.id),
            email: session.email,
            title: "WebMCP Native Wiki",
            pageType: "concept",
            markdown:
              "# WebMCP Native Wiki\n\n사람과 에이전트가 같은 지식 공간을 함께 편집합니다.\n",
            parentId: null,
            operationId: operationId(body.operation_id),
            requestId: id,
            origin: originFrom(request),
          })
        : null;
    return Response.json(
      success(
        {
          wiki,
          template,
          current_page_id: starterPage?.page_id ?? null,
          starter_page: starterPage,
          refresh_required: false,
          stale_after_response: false,
        },
        id,
      ),
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}
