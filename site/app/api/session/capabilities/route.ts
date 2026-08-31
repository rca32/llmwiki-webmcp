import { success } from "../../../../lib/contracts";
import { errorResponse, requestId } from "../../../../lib/http";
import { getWikiSession } from "../../../../lib/server-session";

export async function GET() {
  const id = requestId("session.capabilities");
  try {
    const session = await getWikiSession();
    return Response.json(
      success(
        {
          identity: { email: session.email, display_name: session.displayName },
          wiki: session.wikiId
            ? {
                id: session.wikiId,
                title: session.wikiTitle,
                role: session.role,
              }
            : null,
          capabilities: session.capabilities,
          site_version: session.siteVersion,
          write_mode: session.writeMode,
          write_mode_reason: session.writeModeReason,
        },
        id,
      ),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}
