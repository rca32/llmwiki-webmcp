import { AppError, type LinkMode, type PageType } from "./contracts";
export const PAGE_TYPES: PageType[] = [
  "folder",
  "note",
  "source",
  "concept",
  "entity",
  "synthesis",
  "comparison",
  "query",
];
export const MAX_MARKDOWN = 262_144;
export function requireObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AppError("validation_error", "A JSON object is required.", 400);
  return value as Record<string, unknown>;
}
export function requiredString(
  value: unknown,
  field: string,
  min: number,
  max: number,
): string {
  if (typeof value !== "string")
    throw new AppError("validation_error", `${field} must be a string.`, 400, {
      field,
    });
  const result = value.trim();
  if (result.length < min || result.length > max)
    throw new AppError(
      "validation_error",
      `${field} must be between ${min} and ${max} characters.`,
      400,
      { field, min, max },
    );
  return result;
}
export function optionalNullableString(
  value: unknown,
  field: string,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  return requiredString(value, field, 1, 200);
}
export function optionalUrl(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  const result = requiredString(value, field, 1, 2048);
  try {
    const url = new URL(result);
    if (url.protocol !== "http:" && url.protocol !== "https:")
      throw new Error();
    return url.toString();
  } catch {
    throw new AppError(
      "validation_error",
      `${field} must be an http or https URL.`,
      400,
      { field },
    );
  }
}
export function optionalIsoDate(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  const result = requiredString(value, field, 1, 64);
  const parsed = new Date(result);
  if (Number.isNaN(parsed.getTime()))
    throw new AppError(
      "validation_error",
      `${field} must be an ISO-8601 timestamp.`,
      400,
      { field },
    );
  return parsed.toISOString();
}
export function optionalNumber(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new AppError(
      "validation_error",
      `${field} must be a number between ${min} and ${max}.`,
      400,
      { field, min, max },
    );
  return value;
}
export function requiredInteger(
  value: unknown,
  field: string,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max)
    throw new AppError(
      "validation_error",
      `${field} must be an integer between ${min} and ${max}.`,
      400,
      { field, min, max },
    );
  return Number(value);
}
export function pageType(value: unknown): PageType {
  if (typeof value !== "string" || !PAGE_TYPES.includes(value as PageType))
    throw new AppError("validation_error", "page_type is not supported.", 400, {
      allowed: PAGE_TYPES,
    });
  return value as PageType;
}
export function operationId(value: unknown): string {
  const result = requiredString(value, "operation_id", 36, 36);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      result,
    )
  )
    throw new AppError(
      "validation_error",
      "operation_id must be a UUID.",
      400,
      { field: "operation_id" },
    );
  return result.toLowerCase();
}
export function linkMode(value: unknown): LinkMode {
  if (value !== "related_frontmatter" && value !== "append_section")
    throw new AppError(
      "validation_error",
      "link_mode must be related_frontmatter or append_section.",
      400,
      { field: "link_mode" },
    );
  return value;
}
export function slugify(title: string): string {
  const slug = title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\\/\u0000-\u001f\u007f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  if (!slug || slug === "." || slug === "..")
    throw new AppError(
      "validation_error",
      "The title cannot produce a safe page path.",
      400,
      { field: "title" },
    );
  return slug;
}
export function extractWikiLinks(markdown: string): string[] {
  const found = new Set<string>();
  for (const match of markdown.matchAll(
    /\[\[([^\]|#]{1,200})(?:[|#][^\]]*)?\]\]/g,
  ))
    found.add(match[1].trim());
  return [...found];
}
export function parseFrontmatter(
  markdown: string,
): Record<string, string | number | boolean | string[]> {
  if (!markdown.startsWith("---\n") && !markdown.startsWith("---\r\n"))
    return {};
  const normalized = markdown.replaceAll("\r\n", "\n"),
    end = normalized.indexOf("\n---\n", 4);
  if (end < 0)
    throw new AppError(
      "validation_error",
      "Markdown frontmatter is missing its closing --- marker.",
      400,
      { field: "markdown" },
    );
  const result: Record<string, string | number | boolean | string[]> = {};
  for (const [index, line] of normalized.slice(4, end).split("\n").entries()) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]{0,63}):\s*(.*)$/);
    if (!match)
      throw new AppError(
        "validation_error",
        "Frontmatter must use simple key: value entries.",
        400,
        { line: index + 2 },
      );
    const [, key, raw] = match;
    if (raw === "true" || raw === "false") result[key] = raw === "true";
    else if (/^-?\d+(?:\.\d+)?$/.test(raw)) result[key] = Number(raw);
    else if (raw.startsWith("[") && raw.endsWith("]")) {
      try {
        const value = JSON.parse(raw);
        if (
          !Array.isArray(value) ||
          value.some((item) => typeof item !== "string")
        )
          throw new Error();
        result[key] = value;
      } catch {
        throw new AppError(
          "validation_error",
          "Frontmatter arrays must be JSON string arrays.",
          400,
          { key },
        );
      }
    } else result[key] = raw.replace(/^(['"])(.*)\1$/, "$2");
  }
  return result;
}
export function appendMarkdownToSection(
  markdown: string,
  content: string,
  section: string | null,
  replaceEmptyState = false,
) {
  if (!section) return `${markdown.trimEnd()}\n\n${content}`;
  const lines = markdown.split("\n"),
    headingIndex = lines.findIndex(
      (line) =>
        line
          .replace(/^#+\s*/, "")
          .trim()
          .toLowerCase() === section.toLowerCase(),
    );
  if (headingIndex < 0)
    return `${markdown.trimEnd()}\n\n## ${section}\n\n${content}`;
  let insertAt = headingIndex + 1;
  const level = lines[headingIndex].match(/^#+/)?.[0].length ?? 1;
  while (insertAt < lines.length) {
    const next = lines[insertAt].match(/^(#+)\s/);
    if (next && next[1].length <= level) break;
    insertAt++;
  }
  if (replaceEmptyState) {
    const bodyIndexes = Array.from(
      { length: insertAt - headingIndex - 1 },
      (_, index) => headingIndex + index + 1,
    ).filter((index) => lines[index].trim());
    if (
      bodyIndexes.length === 1 &&
      /^(?:아직\s+.+(?:없습니다|없어요)\.?|no\s+.+\s+yet\.?)$/i.test(
        lines[bodyIndexes[0]].trim(),
      )
    ) {
      lines.splice(
        headingIndex + 1,
        insertAt - headingIndex - 1,
        "",
        content,
        "",
      );
      return lines.join("\n");
    }
  }
  lines.splice(insertAt, 0, "", content);
  return lines.join("\n");
}
export function addRelatedWikiLink(markdown: string, wikiLink: string) {
  const normalized = markdown.replaceAll("\r\n", "\n");
  if (!normalized.startsWith("---\n"))
    return `---\nrelated: ${JSON.stringify([wikiLink])}\n---\n\n${normalized}`;
  const closingIndex = normalized.indexOf("\n---\n", 4);
  if (closingIndex < 0) {
    parseFrontmatter(normalized);
    return normalized;
  }
  const frontmatter = parseFrontmatter(normalized),
    existing = frontmatter.related,
    related = Array.isArray(existing)
      ? [...existing, wikiLink]
      : existing === undefined
        ? [wikiLink]
        : [String(existing), wikiLink],
    lines = normalized.slice(4, closingIndex).split("\n"),
    relatedIndex = lines.findIndex((line) => /^related:\s*/i.test(line));
  if (relatedIndex >= 0)
    lines[relatedIndex] = `related: ${JSON.stringify(related)}`;
  else lines.push(`related: ${JSON.stringify(related)}`);
  return `---\n${lines.join("\n")}\n---\n${normalized.slice(closingIndex + 5)}`;
}
export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
export async function sha256Bytes(value: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
