import { AppError } from "./contracts";

type CursorPayload = {
  v: 1;
  scope: string;
  offset: number;
};

export function encodeCursor(scope: string, offset: number): string {
  const json = JSON.stringify({ v: 1, scope, offset } satisfies CursorPayload);
  return btoa(unescape(encodeURIComponent(json)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

export function decodeCursor(
  value: string | null | undefined,
  scope: string,
): number {
  if (!value) return 0;
  try {
    const padded = value
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "=");
    const parsed = JSON.parse(
      decodeURIComponent(escape(atob(padded))),
    ) as Partial<CursorPayload>;
    if (
      parsed.v !== 1 ||
      parsed.scope !== scope ||
      !Number.isSafeInteger(parsed.offset) ||
      Number(parsed.offset) < 0
    )
      throw new Error("invalid cursor payload");
    return Number(parsed.offset);
  } catch {
    throw new AppError(
      "validation_error",
      "cursor is invalid or belongs to a different query.",
      400,
      { field: "cursor" },
    );
  }
}
