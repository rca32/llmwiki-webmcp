import { AppError, success } from "../../../lib/contracts";
import { errorResponse, jsonBody, requestId } from "../../../lib/http";
import {
  getWikiSession,
  requireWikiSession,
} from "../../../lib/server-session";
import {
  bootstrapWiki,
  createWiki,
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
    const session = await requireWikiSession("can_read");
    const body = requireObject(await jsonBody(request));
    const title = requiredString(body.title, "title", 1, 120);
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
    return Response.json(success({ wiki }, id), { status: 201 });
  } catch (error) {
    return errorResponse(error, id);
  }
}
