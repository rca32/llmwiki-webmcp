import {
  AppError,
  success,
  type RetrievalStatus,
} from "../../../lib/contracts";
import {
  countPagesForList,
  appendPage,
  createPage,
  listDeletedPages,
  listPages,
} from "../../../db/wiki-repository";
import {
  errorResponse,
  jsonBody,
  originFrom,
  requestId,
} from "../../../lib/http";
import { requireWikiSession } from "../../../lib/server-session";
import { decodeCursor, encodeCursor } from "../../../lib/pagination";
import {
  MAX_MARKDOWN,
  operationId,
  optionalIsoDate,
  optionalNumber,
  optionalNullableString,
  optionalUrl,
  pageType,
  requireObject,
  requiredInteger,
  requiredString,
} from "../../../lib/validation";

const RETRIEVAL_STATUSES: RetrievalStatus[] = [
  "success",
  "partial",
  "failed",
  "unavailable",
];

export async function GET(request: Request) {
  const id = requestId("page.list");
  try {
    const session = await requireWikiSession("can_read");
    const url = new URL(request.url),
      limit = requiredInteger(
        Number(url.searchParams.get("limit") ?? 100),
        "limit",
        1,
        200,
      );
    const deleted = url.searchParams.get("deleted") === "only";
    if (deleted) {
      const pages = await listDeletedPages(session.wikiId!, limit);
      return Response.json(success({ pages }, id), {
        headers: { "cache-control": "no-store" },
      });
    }
    const parentValue = url.searchParams.get("parent_id"),
      parentId = parentValue ? parentValue : null,
      depth = requiredInteger(
        Number(url.searchParams.get("depth") ?? 0),
        "depth",
        0,
        64,
      );
    const includeMarkdown = url.searchParams.get("include_markdown") === "true",
      scope = `pages:${session.wikiId}:${parentId ?? "root"}:${depth}`,
      offset = decodeCursor(url.searchParams.get("cursor"), scope),
      [pages, total] = await Promise.all([
        listPages(session.wikiId!, parentId, limit, depth, offset),
        countPagesForList(session.wikiId!, parentId, depth),
      ]),
      hasMore = offset + pages.length < total,
      projected = includeMarkdown
        ? pages
        : pages.map((page) => ({
            id: page.id,
            wiki_id: page.wiki_id,
            parent_id: page.parent_id,
            slug: page.slug,
            path: page.path,
            title: page.title,
            page_type: page.page_type,
            version: page.version,
            sort_order: page.sort_order,
            updated_at: page.updated_at,
            source_url: page.source_url,
            retrieval_status: page.retrieval_status,
            retrieved_at: page.retrieved_at,
            extraction_method: page.extraction_method,
            confidence: page.confidence,
          }));
    return Response.json(
      success(
        {
          pages: projected,
          total,
          has_more: hasMore,
          next_cursor: hasMore
            ? encodeCursor(scope, offset + pages.length)
            : null,
          include_markdown: includeMarkdown,
        },
        id,
      ),
      {
        headers: { "cache-control": "no-store" },
      },
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}
export async function POST(request: Request) {
  const id = requestId("page.create");
  try {
    const session = await requireWikiSession("can_write");
    const body = requireObject(await jsonBody(request)),
      requestedPageType = pageType(body.page_type),
      sourceUrl = optionalUrl(body.source_url, "source_url"),
      retrievalStatus =
        body.retrieval_status === null || body.retrieval_status === undefined
          ? null
          : (requiredString(
              body.retrieval_status,
              "retrieval_status",
              1,
              32,
            ) as RetrievalStatus),
      retrievedAt = optionalIsoDate(body.retrieved_at, "retrieved_at"),
      extractionMethod =
        body.extraction_method === null || body.extraction_method === undefined
          ? null
          : requiredString(body.extraction_method, "extraction_method", 1, 120),
      confidence = optionalNumber(body.confidence, "confidence", 0, 1);
    if (retrievalStatus && !RETRIEVAL_STATUSES.includes(retrievalStatus))
      throw new AppError(
        "validation_error",
        "retrieval_status is not supported.",
        400,
        { field: "retrieval_status", allowed: RETRIEVAL_STATUSES },
      );
    if (
      requestedPageType !== "source" &&
      [
        sourceUrl,
        retrievalStatus,
        retrievedAt,
        extractionMethod,
        confidence,
      ].some((value) => value !== null)
    )
      throw new AppError(
        "validation_error",
        "Structured retrieval metadata is only valid for source pages.",
        400,
        { field: "page_type" },
      );
    const indexPageId = optionalNullableString(
        body.index_page_id,
        "index_page_id",
      ),
      indexExpectedVersion =
        body.index_expected_version === null ||
        body.index_expected_version === undefined
          ? null
          : requiredInteger(
              body.index_expected_version,
              "index_expected_version",
              1,
            ),
      indexSection = optionalNullableString(
        body.index_section,
        "index_section",
      ),
      indexEntry =
        body.index_entry_markdown === null ||
        body.index_entry_markdown === undefined
          ? null
          : requiredString(
              body.index_entry_markdown,
              "index_entry_markdown",
              1,
              4000,
            );
    if ((indexPageId === null) !== (indexExpectedVersion === null))
      throw new AppError(
        "validation_error",
        "index_page_id and index_expected_version must be provided together.",
        400,
        { field: "index_page_id" },
      );
    const result = await createPage({
      wikiId: session.wikiId!,
      email: session.email,
      title: requiredString(body.title, "title", 1, 200),
      pageType: requestedPageType,
      markdown: requiredString(body.markdown, "markdown", 1, MAX_MARKDOWN),
      parentId: optionalNullableString(body.parent_id, "parent_id"),
      operationId: operationId(body.operation_id),
      requestId: id,
      origin: originFrom(request),
      sourceUrl,
      retrievalStatus,
      retrievedAt,
      extractionMethod,
      confidence,
    });
    const indexUpdate =
      indexPageId && indexExpectedVersion
        ? await appendPage({
            wikiId: session.wikiId!,
            email: session.email,
            pageId: indexPageId,
            expectedVersion: indexExpectedVersion,
            content:
              indexEntry ??
              `- [[${requiredString(body.title, "title", 1, 200).replace(/[\[\]|#]/g, "")}]]`,
            section: indexSection,
            replaceEmptyState: body.replace_empty_state !== false,
            operationId: operationId(body.operation_id),
            requestId: id,
            origin: originFrom(request),
          })
        : null;
    return Response.json(
      success(
        {
          ...result,
          wiki_id: session.wikiId!,
          page_type: requestedPageType,
          source: {
            source_url: sourceUrl,
            retrieval_status: retrievalStatus,
            retrieved_at: retrievedAt,
            extraction_method: extractionMethod,
            confidence,
          },
          verified: true,
          verification_basis: "committed_page_summary",
          index_update: indexUpdate,
        },
        id,
        {
          pages_changed: [
            String(result.page_id),
            ...(indexPageId ? [indexPageId] : []),
          ],
          tree_changed: true,
          links_changed: true,
          search_changed: true,
          graph_changed: true,
          knowledge_changed: false,
        },
      ),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}
