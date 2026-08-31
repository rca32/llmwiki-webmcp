import { AppError, type PageType, type RetrievalStatus } from "./contracts";
import { LLM_WIKI_CORE_IDEA } from "./llm-wiki-core";
import {
  MAX_MARKDOWN,
  PAGE_TYPES,
  optionalIsoDate,
  optionalNumber,
  optionalNullableString,
  optionalUrl,
  pageType,
  requireObject,
  requiredString,
  sha256,
  stableJson,
} from "./validation";

export const SOURCE_METADATA_FIELDS = [
  "source_url",
  "retrieval_status",
  "retrieved_at",
  "extraction_method",
  "confidence",
] as const;
export type SourceMetadataField = (typeof SOURCE_METADATA_FIELDS)[number];

export type WikiOperatingContract = {
  purpose: string;
  allowed_page_types: PageType[];
  naming_policy: "descriptive_titles";
  linking_policy: "wikilinks_and_claims";
  duplicate_strategy: "search_before_create";
  required_source_metadata: SourceMetadataField[];
  minimum_source_confidence: number;
  approval_policy: "plan_before_apply";
  archive_policy: "soft_delete_only";
};

export const DEFAULT_OPERATING_CONTRACT: WikiOperatingContract = {
  purpose: LLM_WIKI_CORE_IDEA,
  allowed_page_types: [...PAGE_TYPES],
  naming_policy: "descriptive_titles",
  linking_policy: "wikilinks_and_claims",
  duplicate_strategy: "search_before_create",
  required_source_metadata: [
    "source_url",
    "retrieval_status",
    "retrieved_at",
    "extraction_method",
    "confidence",
  ],
  minimum_source_confidence: 0.5,
  approval_policy: "plan_before_apply",
  archive_policy: "soft_delete_only",
};

export type IngestSourceDraft = {
  title: string;
  markdown: string;
  parent_id: string | null;
  source_url: string;
  retrieval_status: RetrievalStatus;
  retrieved_at: string;
  extraction_method: string;
  confidence: number;
};

export type IngestPageDraft = {
  title: string;
  page_type: Exclude<PageType, "folder" | "source">;
  markdown: string;
  parent_id: string | null;
};

export type ClaimReference = { page_id?: string; title?: string };
export type IngestClaimDraft = {
  subject: ClaimReference;
  predicate: string;
  object: ClaimReference & { value?: string };
  source_page_id: string | null;
  evidence_fragment: string;
  confidence: number;
  observed_at: string;
  valid_from: string | null;
  valid_to: string | null;
  supersedes_claim_id: string | null;
};

export type IngestRequest = {
  source: IngestSourceDraft;
  pages: IngestPageDraft[];
  claims: IngestClaimDraft[];
};

export type LintPage = {
  id: string;
  parent_id: string | null;
  title: string;
  slug: string;
  page_type: PageType;
  source_url: string | null;
  retrieval_status: RetrievalStatus | null;
  retrieved_at: string | null;
  extraction_method: string | null;
  confidence: number | null;
};
export type LintLink = {
  source_page_id: string;
  target_page_id: string | null;
  target_text: string;
};
export type LintClaim = {
  id: string;
  subject_page_id: string;
  source_page_id: string;
  valid_to: string | null;
};
export type WikiLintIssue = {
  code:
    | "missing_source_metadata"
    | "unresolved_link"
    | "orphan_page"
    | "duplicate_title"
    | "ungrounded_claim"
    | "expired_claim"
    | "low_confidence_source";
  severity: "error" | "warning" | "info";
  page_id: string | null;
  claim_id: string | null;
  message: string;
  next_action: string;
};

export function classifyIngestPageAction(
  existing: { id: string; version: number } | null,
) {
  return existing
    ? {
        kind: "update" as const,
        target_page_id: existing.id,
        expected_version: existing.version,
      }
    : {
        kind: "create" as const,
        target_page_id: null,
        expected_version: null,
      };
}

export function canonicalIngestPlanHash(value: unknown) {
  return sha256(stableJson(value));
}

export function isIngestPlanExpired(expiresAt: string, at = new Date()) {
  return expiresAt <= at.toISOString();
}

function exactEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T {
  const result = requiredString(value, field, 1, 100) as T;
  if (!allowed.includes(result))
    throw new AppError("validation_error", `${field} is not supported.`, 400, {
      field,
      allowed,
    });
  return result;
}

function uuidOrNull(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  const result = requiredString(value, field, 36, 36).toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      result,
    )
  )
    throw new AppError("validation_error", `${field} must be a UUID.`, 400, {
      field,
    });
  return result;
}

function boundedArray(
  value: unknown,
  field: string,
  maximum: number,
): unknown[] {
  if (!Array.isArray(value) || value.length > maximum)
    throw new AppError(
      "validation_error",
      `${field} must be an array with at most ${maximum} items.`,
      400,
      { field, maximum },
    );
  return value;
}

export function parseOperatingContract(value: unknown): WikiOperatingContract {
  const body = requireObject(value),
    allowedPageTypes = boundedArray(
      body.allowed_page_types,
      "allowed_page_types",
      PAGE_TYPES.length,
    ).map(pageType),
    requiredMetadata = boundedArray(
      body.required_source_metadata,
      "required_source_metadata",
      SOURCE_METADATA_FIELDS.length,
    ).map((item) =>
      exactEnum(item, "required_source_metadata", SOURCE_METADATA_FIELDS),
    );
  if (!allowedPageTypes.includes("source"))
    throw new AppError(
      "validation_error",
      "allowed_page_types must include source.",
      400,
      { field: "allowed_page_types" },
    );
  return {
    purpose: requiredString(body.purpose, "purpose", 1, 500),
    allowed_page_types: [...new Set(allowedPageTypes)],
    naming_policy: exactEnum(body.naming_policy, "naming_policy", [
      "descriptive_titles",
    ]),
    linking_policy: exactEnum(body.linking_policy, "linking_policy", [
      "wikilinks_and_claims",
    ]),
    duplicate_strategy: exactEnum(
      body.duplicate_strategy,
      "duplicate_strategy",
      ["search_before_create"],
    ),
    required_source_metadata: [...new Set(requiredMetadata)],
    minimum_source_confidence:
      optionalNumber(
        body.minimum_source_confidence,
        "minimum_source_confidence",
        0,
        1,
      ) ?? 0.5,
    approval_policy: exactEnum(body.approval_policy, "approval_policy", [
      "plan_before_apply",
    ]),
    archive_policy: exactEnum(body.archive_policy, "archive_policy", [
      "soft_delete_only",
    ]),
  };
}

function parseReference(value: unknown, field: string): ClaimReference {
  const body = requireObject(value),
    pageId = uuidOrNull(body.page_id, `${field}.page_id`),
    title = optionalNullableString(body.title, `${field}.title`);
  if ((pageId === null) === (title === null))
    throw new AppError(
      "validation_error",
      `${field} must contain exactly one of page_id or title.`,
      400,
      { field },
    );
  return pageId ? { page_id: pageId } : { title: title! };
}

function parseClaim(value: unknown): IngestClaimDraft {
  const body = requireObject(value),
    objectBody = requireObject(body.object),
    objectPageId = uuidOrNull(objectBody.page_id, "object.page_id"),
    objectTitle = optionalNullableString(objectBody.title, "object.title"),
    objectValue = optionalNullableString(objectBody.value, "object.value"),
    objectCount = [objectPageId, objectTitle, objectValue].filter(
      (item) => item !== null,
    ).length;
  if (objectCount !== 1)
    throw new AppError(
      "validation_error",
      "object must contain exactly one of page_id, title, or value.",
      400,
      { field: "object" },
    );
  const observedAt =
      optionalIsoDate(body.observed_at, "observed_at") ??
      new Date().toISOString(),
    validFrom = optionalIsoDate(body.valid_from, "valid_from"),
    validTo = optionalIsoDate(body.valid_to, "valid_to");
  if (validFrom && validTo && validTo < validFrom)
    throw new AppError(
      "validation_error",
      "valid_to must not be earlier than valid_from.",
      400,
      { field: "valid_to" },
    );
  return {
    subject: parseReference(body.subject, "subject"),
    predicate: requiredString(body.predicate, "predicate", 1, 120),
    object: objectPageId
      ? { page_id: objectPageId }
      : objectTitle
        ? { title: objectTitle }
        : { value: objectValue! },
    source_page_id: uuidOrNull(body.source_page_id, "source_page_id"),
    evidence_fragment: requiredString(
      body.evidence_fragment,
      "evidence_fragment",
      1,
      2000,
    ),
    confidence: optionalNumber(body.confidence, "confidence", 0, 1) ?? 0.5,
    observed_at: observedAt,
    valid_from: validFrom,
    valid_to: validTo,
    supersedes_claim_id: uuidOrNull(
      body.supersedes_claim_id,
      "supersedes_claim_id",
    ),
  };
}

export function parseIngestRequest(value: unknown): IngestRequest {
  const body = requireObject(value),
    sourceBody = requireObject(body.source),
    sourceUrl = optionalUrl(sourceBody.source_url, "source.source_url"),
    sourceStatus = exactEnum(sourceBody.retrieval_status, "retrieval_status", [
      "success",
      "partial",
      "failed",
      "unavailable",
    ] as const),
    pages = boundedArray(body.pages ?? [], "pages", 20).map((item) => {
      const page = requireObject(item),
        parsedType = pageType(page.page_type);
      if (parsedType === "folder" || parsedType === "source")
        throw new AppError(
          "validation_error",
          "Proposed knowledge pages cannot use folder or source page_type.",
          400,
          { field: "pages.page_type" },
        );
      return {
        title: requiredString(page.title, "pages.title", 1, 200),
        page_type: parsedType,
        markdown: requiredString(
          page.markdown,
          "pages.markdown",
          1,
          MAX_MARKDOWN,
        ),
        parent_id: uuidOrNull(page.parent_id, "pages.parent_id"),
      } as IngestPageDraft;
    }),
    claims = boundedArray(body.claims ?? [], "claims", 100).map(parseClaim);
  const titleKeys = [sourceBody.title, ...pages.map((page) => page.title)].map(
    (title) => String(title).trim().toLocaleLowerCase(),
  );
  if (new Set(titleKeys).size !== titleKeys.length)
    throw new AppError(
      "validation_error",
      "Source and proposed page titles must be unique within one ingest plan.",
      400,
      { field: "pages.title" },
    );
  if (!sourceUrl)
    throw new AppError(
      "validation_error",
      "source.source_url is required.",
      400,
      { field: "source.source_url" },
    );
  return {
    source: {
      title: requiredString(sourceBody.title, "source.title", 1, 200),
      markdown: requiredString(
        sourceBody.markdown,
        "source.markdown",
        1,
        MAX_MARKDOWN,
      ),
      parent_id: uuidOrNull(sourceBody.parent_id, "source.parent_id"),
      source_url: sourceUrl,
      retrieval_status: sourceStatus,
      retrieved_at:
        optionalIsoDate(sourceBody.retrieved_at, "source.retrieved_at") ??
        new Date().toISOString(),
      extraction_method: requiredString(
        sourceBody.extraction_method,
        "source.extraction_method",
        1,
        120,
      ),
      confidence:
        optionalNumber(sourceBody.confidence, "source.confidence", 0, 1) ?? 0.5,
    },
    pages,
    claims,
  };
}

export function buildWikiLintReport(input: {
  pages: LintPage[];
  links: LintLink[];
  claims: LintClaim[];
  contract: WikiOperatingContract;
  limit: number;
  at?: Date;
}) {
  const issues: WikiLintIssue[] = [],
    pageIds = new Set(input.pages.map((page) => page.id)),
    linked = new Set<string>(),
    at = (input.at ?? new Date()).toISOString(),
    add = (issue: WikiLintIssue) => issues.push(issue);
  for (const link of input.links) {
    linked.add(link.source_page_id);
    if (link.target_page_id) linked.add(link.target_page_id);
    else
      add({
        code: "unresolved_link",
        severity: "warning",
        page_id: link.source_page_id,
        claim_id: null,
        message: `The wiki link [[${link.target_text}]] does not resolve to one active page.`,
        next_action: "Create, rename, or retarget the linked page.",
      });
  }
  const siblingTitles = new Map<string, LintPage[]>();
  for (const page of input.pages) {
    const key = `${page.parent_id ?? "__root__"}:${page.title.trim().toLocaleLowerCase()}`;
    siblingTitles.set(key, [...(siblingTitles.get(key) ?? []), page]);
    if (page.page_type === "source") {
      const values: Record<SourceMetadataField, unknown> = {
        source_url: page.source_url,
        retrieval_status: page.retrieval_status,
        retrieved_at: page.retrieved_at,
        extraction_method: page.extraction_method,
        confidence: page.confidence,
      };
      const missing = input.contract.required_source_metadata.filter(
        (field) => values[field] === null || values[field] === "",
      );
      if (missing.length)
        add({
          code: "missing_source_metadata",
          severity: "error",
          page_id: page.id,
          claim_id: null,
          message: `Source metadata is missing: ${missing.join(", ")}.`,
          next_action: "Repair the source record before relying on its claims.",
        });
      if (
        page.confidence !== null &&
        page.confidence < input.contract.minimum_source_confidence
      )
        add({
          code: "low_confidence_source",
          severity: "info",
          page_id: page.id,
          claim_id: null,
          message: `Source confidence ${page.confidence} is below the vault threshold ${input.contract.minimum_source_confidence}.`,
          next_action:
            "Review or replace the source before high-confidence synthesis.",
        });
    }
  }
  for (const pages of siblingTitles.values())
    if (pages.length > 1)
      for (const page of pages)
        add({
          code: "duplicate_title",
          severity: "warning",
          page_id: page.id,
          claim_id: null,
          message: "Multiple sibling pages use the same normalized title.",
          next_action:
            "Choose one canonical page and merge or rename the others.",
        });
  for (const page of input.pages)
    if (page.page_type !== "folder" && !linked.has(page.id))
      add({
        code: "orphan_page",
        severity: "info",
        page_id: page.id,
        claim_id: null,
        message: "This page has no incoming or outgoing resolved wiki links.",
        next_action: "Connect it to a canonical concept or index page.",
      });
  for (const claim of input.claims) {
    if (!pageIds.has(claim.source_page_id))
      add({
        code: "ungrounded_claim",
        severity: "error",
        page_id: claim.subject_page_id,
        claim_id: claim.id,
        message: "The claim does not reference an active source page.",
        next_action: "Attach an active source page or supersede the claim.",
      });
    if (claim.valid_to && claim.valid_to < at)
      add({
        code: "expired_claim",
        severity: "warning",
        page_id: claim.subject_page_id,
        claim_id: claim.id,
        message: `The claim validity ended at ${claim.valid_to}.`,
        next_action: "Review whether a newer claim should supersede it.",
      });
  }
  const order = { error: 0, warning: 1, info: 2 } as const;
  issues.sort(
    (a, b) =>
      order[a.severity] - order[b.severity] ||
      a.code.localeCompare(b.code) ||
      String(a.page_id).localeCompare(String(b.page_id)),
  );
  const counts = {
    error: issues.filter((issue) => issue.severity === "error").length,
    warning: issues.filter((issue) => issue.severity === "warning").length,
    info: issues.filter((issue) => issue.severity === "info").length,
  };
  return {
    issues: issues.slice(0, input.limit),
    total: issues.length,
    truncated: issues.length > input.limit,
    counts,
  };
}
