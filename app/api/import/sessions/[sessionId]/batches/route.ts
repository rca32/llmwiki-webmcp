import { uploadImportPart } from "../../../../../../db/wiki-repository";
import { AppError, success } from "../../../../../../lib/contracts";
import { errorResponse, requestId } from "../../../../../../lib/http";
import { requireImportAuthority } from "../../../../../../lib/server-session";
import { requiredInteger } from "../../../../../../lib/validation";

const MAX_PART_BYTES = 512 * 1024;
type Context = { params: Promise<{ sessionId: string }> };
export async function POST(request: Request, { params }: Context) {
  const id = requestId();
  try {
    const session = await requireImportAuthority(),
      { sessionId } = await params,
      url = new URL(request.url),
      partNumber = requiredInteger(
        Number(url.searchParams.get("part")),
        "part",
        0,
        1000,
      ),
      declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_PART_BYTES)
      throw new AppError(
        "validation_error",
        "An import part cannot exceed 512 KiB.",
        413,
        { max_bytes: MAX_PART_BYTES },
      );
    const data = await request.arrayBuffer();
    if (data.byteLength > MAX_PART_BYTES)
      throw new AppError(
        "validation_error",
        "An import part cannot exceed 512 KiB.",
        413,
        { max_bytes: MAX_PART_BYTES },
      );
    const result = await uploadImportPart({
      email: session.email,
      sessionId,
      partNumber,
      data,
    });
    return Response.json(success(result, id));
  } catch (error) {
    return errorResponse(error, id);
  }
}
