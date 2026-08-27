import { AppError, success } from "../../../../lib/contracts";
import { prepareExport } from "../../../../db/wiki-repository";
import { errorResponse, jsonBody, requestId } from "../../../../lib/http";
import { requireWikiSession } from "../../../../lib/server-session";
import { requireObject } from "../../../../lib/validation";

export async function POST(request: Request) {
  const id = requestId();
  try {
    const body = requireObject(await jsonBody(request)),
      profile = body.profile ?? "portable";
    if (profile !== "portable" && profile !== "full")
      throw new AppError(
        "validation_error",
        "profile must be portable or full.",
        400,
        { field: "profile" },
      );
    const session = await requireWikiSession(
      profile === "full" ? "can_full_backup" : "can_export_portable",
    );
    const result = await prepareExport({
      wikiId: session.wikiId!,
      email: session.email,
      profile,
      includeMemberReference: body.include_member_reference === true,
      requestId: id,
    });
    return Response.json(success({ manifest: result }, id));
  } catch (error) {
    return errorResponse(error, id);
  }
}
