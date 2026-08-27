import { AppError, success } from "../../../lib/contracts";
import { errorResponse, jsonBody, requestId } from "../../../lib/http";
import { requireWikiSession } from "../../../lib/server-session";
import {
  bootstrapWiki,
  listAccessibleWikis,
} from "../../../db/wiki-repository";
import {
  requireObject,
  requiredInteger,
  requiredString,
} from "../../../lib/validation";

export async function GET() {
  const id = requestId();
  try {
    const session = await requireWikiSession("can_read");
    return Response.json(
      success({ wikis: await listAccessibleWikis(session.email) }, id),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}

export async function POST(request: Request) {
  const id = requestId();
  try {
    const session = await requireWikiSession("can_bootstrap");
    const body = requireObject(await jsonBody(request));
    const title = requiredString(body.title, "title", 1, 120);
    const expectedVersion = requiredInteger(
      body.expected_version,
      "expected_version",
      1,
    );
    if (!session.capabilities.can_bootstrap)
      throw new AppError(
        "forbidden",
        "This session cannot bootstrap a wiki.",
        403,
      );
    const wiki = await bootstrapWiki({
      email: session.email,
      title,
      expectedVersion,
      requestId: id,
    });
    return Response.json(success({ wiki }, id), { status: 201 });
  } catch (error) {
    return errorResponse(error, id);
  }
}
