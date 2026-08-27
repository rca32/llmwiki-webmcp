import { AppError, success } from "../../../../lib/contracts";
import { errorResponse, jsonBody, requestId } from "../../../../lib/http";
import { requireWikiSession } from "../../../../lib/server-session";
import {
  removeWikiMember,
  upsertWikiMember,
} from "../../../../db/wiki-repository";
import { requireObject, requiredString } from "../../../../lib/validation";

type Context = { params: Promise<{ memberEmail: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const id = requestId();
  try {
    const session = await requireWikiSession("can_manage_members"),
      { memberEmail } = await params,
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
      memberEmail: decodeURIComponent(memberEmail),
      role,
      requestId: id,
    });
    return Response.json(success({ member }, id));
  } catch (error) {
    return errorResponse(error, id);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const id = requestId();
  try {
    const session = await requireWikiSession("can_manage_members"),
      { memberEmail } = await params,
      result = await removeWikiMember({
        wikiId: session.wikiId!,
        email: session.email,
        memberEmail: decodeURIComponent(memberEmail),
        requestId: id,
      });
    return Response.json(success(result, id));
  } catch (error) {
    return errorResponse(error, id);
  }
}
