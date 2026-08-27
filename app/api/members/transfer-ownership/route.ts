import { success } from "../../../../lib/contracts";
import { errorResponse, jsonBody, requestId } from "../../../../lib/http";
import { requireWikiSession } from "../../../../lib/server-session";
import { transferWikiOwnership } from "../../../../db/wiki-repository";
import { requireObject, requiredString } from "../../../../lib/validation";

export async function POST(request: Request) {
  const id = requestId();
  try {
    const session = await requireWikiSession("can_manage_members"),
      body = requireObject(await jsonBody(request)),
      result = await transferWikiOwnership({
        wikiId: session.wikiId!,
        email: session.email,
        memberEmail: requiredString(body.email, "email", 3, 320),
        confirmation: requiredString(body.confirmation, "confirmation", 1, 400),
        requestId: id,
      });
    return Response.json(success(result, id));
  } catch (error) {
    return errorResponse(error, id);
  }
}
