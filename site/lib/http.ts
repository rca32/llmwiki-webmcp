import { AppError, failure } from "./contracts";
import { completeApiRequest, startApiRequest } from "./request-observability";
import { apiOutcomeForError } from "./request-outcome";

export const requestId = (commandName: string) => startApiRequest(commandName);
export async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError(
      "validation_error",
      "The request body must be valid JSON.",
      400,
    );
  }
}
export function errorResponse(error: unknown, id: string): Response {
  const result = failure(error, id);
  completeApiRequest(id, apiOutcomeForError(result.body.error.code));
  return Response.json(result.body, {
    status: result.status,
    headers: { "cache-control": "no-store" },
  });
}
export function originFrom(request: Request): "human" | "webmcp" {
  return request.headers.get("x-wiki-origin") === "webmcp" ? "webmcp" : "human";
}
