import { AppError, success } from "../../../lib/contracts";
import { errorResponse, jsonBody, requestId } from "../../../lib/http";
import { requireWikiSession } from "../../../lib/server-session";
import { listWikiMembers, upsertWikiMember } from "../../../db/wiki-repository";
import { requireObject, requiredString } from "../../../lib/validation";

export async function GET() {
  const id = requestId("member.list");
  try {
    const session = await requireWikiSession("can_manage_members");
    return Response.json(
      success({ members: await listWikiMembers(session.wikiId!) }, id),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}

export async function POST(request: Request) {
  const id = requestId("member.upsert");
  try {
    const session = await requireWikiSession("can_manage_members"),
      body = requireObject(await jsonBody(request)),
      role = requiredString(body.role, "role", 6, 6);
    if (role !== "editor" && role !== "viewer")
      throw new AppError(
        "validation_error",
        "role must be editor or viewer.",
        400,
        { field: "role" },
      );
    const member = await upsertWikiMember({
      wikiId: session.wikiId!,
      email: session.email,
      memberEmail: requiredString(body.email, "email", 3, 320),
      role,
      requestId: id,
    });
    return Response.json(success({ member }, id), { status: 201 });
  } catch (error) {
    return errorResponse(error, id);
  }
}
