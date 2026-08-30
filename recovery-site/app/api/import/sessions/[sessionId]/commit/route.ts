import { commitImport } from "../../../../../../db/wiki-repository";
import { success } from "../../../../../../lib/contracts";
import { errorResponse, requestId } from "../../../../../../lib/http";
import { requireImportAuthority } from "../../../../../../lib/server-session";

type Context = { params: Promise<{ sessionId: string }> };
export async function POST(_request: Request, { params }: Context) {
  const id = requestId("import.commit");
  try {
    const session = await requireImportAuthority(),
      { sessionId } = await params,
      result = await commitImport({
        email: session.email,
        sessionId,
        requestId: id,
      });
    return Response.json(success(result, id));
  } catch (error) {
    return errorResponse(error, id);
  }
}
