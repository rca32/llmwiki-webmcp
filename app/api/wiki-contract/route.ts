import { success } from "../../../lib/contracts";
import {
  getOperatingContract,
  updateOperatingContract,
} from "../../../db/wiki-repository";
import {
  errorResponse,
  jsonBody,
  originFrom,
  requestId,
} from "../../../lib/http";
import { parseOperatingContract } from "../../../lib/llm-wiki-domain";
import { requireWikiSession } from "../../../lib/server-session";
import {
  operationId,
  requireObject,
  requiredInteger,
} from "../../../lib/validation";

export async function GET() {
  const id = requestId("wiki.contract.get");
  try {
    const session = await requireWikiSession("can_read");
    return Response.json(
      success(await getOperatingContract(session.wikiId!), id),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}

export async function PUT(request: Request) {
  const id = requestId("wiki.contract.update");
  try {
    const session = await requireWikiSession("can_write"),
      body = requireObject(await jsonBody(request)),
      result = await updateOperatingContract({
        wikiId: session.wikiId!,
        email: session.email,
        contract: parseOperatingContract(body.contract),
        expectedVersion: requiredInteger(
          body.expected_version,
          "expected_version",
          0,
        ),
        operationId: operationId(body.operation_id),
        requestId: id,
        origin: originFrom(request),
      });
    return Response.json(success(result, id));
  } catch (error) {
    return errorResponse(error, id);
  }
}
