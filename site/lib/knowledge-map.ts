import { AppError } from "./contracts";
import {
  optionalNullableString,
  requireObject,
  requiredInteger,
  requiredString,
} from "./validation";

export const KNOWLEDGE_PRESENTATIONS = [
  "cluster",
  "sequence",
  "comparison",
  "questions",
  "evidence",
] as const;
export const KNOWLEDGE_PLACEMENT_ROLES = [
  "primary",
  "supporting",
  "evidence",
  "question",
] as const;

export type KnowledgePresentation = (typeof KNOWLEDGE_PRESENTATIONS)[number];
export type KnowledgePlacementRole = (typeof KNOWLEDGE_PLACEMENT_ROLES)[number];

export type KnowledgeMapPolicy = {
  max_depth: number;
  max_placements_per_page: number;
  top_level_min: number;
  top_level_max: number;
  core_items_per_topic: number;
  manual_lock_policy: "preserve";
  evidence_mode: "collapsed";
  presentations: KnowledgePresentation[];
};

export const DEFAULT_KNOWLEDGE_MAP_POLICY: KnowledgeMapPolicy = {
  max_depth: 4,
  max_placements_per_page: 3,
  top_level_min: 3,
  top_level_max: 7,
  core_items_per_topic: 5,
  manual_lock_policy: "preserve",
  evidence_mode: "collapsed",
  presentations: [...KNOWLEDGE_PRESENTATIONS],
};

export type PageReference = { page_id?: string; title?: string };
export type TopicReference = { topic_id?: string; client_key?: string };

export type KnowledgeTopicDraft = {
  client_key: string;
  topic_id: string | null;
  parent: TopicReference | null;
  title: string;
  summary: string;
  presentation: KnowledgePresentation;
  sort_order: number;
};

export type KnowledgePlacementDraft = {
  placement_id: string | null;
  topic: TopicReference;
  page: PageReference;
  role: KnowledgePlacementRole;
  summary: string;
  sort_order: number;
};

export type KnowledgeInsightEvidenceReference =
  | { claim_id: string }
  | PageReference;

export type KnowledgeInsightItem = {
  statement: string;
  explanation: string | null;
  evidence: KnowledgeInsightEvidenceReference[];
};

export type KnowledgeInsightBrief = {
  headline: string;
  synthesis: string;
  takeaways: KnowledgeInsightItem[];
  tensions: KnowledgeInsightItem[];
  implications: KnowledgeInsightItem[];
  questions: KnowledgeInsightItem[];
};

export type KnowledgeTopicBriefPatch = {
  topic: TopicReference;
  brief: KnowledgeInsightBrief | null;
};

export type KnowledgeMapPatch = {
  expected_version: number;
  topics: KnowledgeTopicDraft[];
  placements: KnowledgePlacementDraft[];
  remove_placement_ids: string[];
  overview_brief?: KnowledgeInsightBrief | null;
  topic_briefs?: KnowledgeTopicBriefPatch[];
};

function exactEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T {
  const result = requiredString(value, field, 1, 32) as T;
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

function boundedArray(value: unknown, field: string, maximum: number) {
  if (!Array.isArray(value) || value.length > maximum)
    throw new AppError(
      "validation_error",
      `${field} must be an array with at most ${maximum} items.`,
      400,
      { field, maximum },
    );
  return value;
}

function parsePageReference(value: unknown, field: string): PageReference {
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

function parseTopicReference(value: unknown, field: string): TopicReference {
  const body = requireObject(value),
    topicId = uuidOrNull(body.topic_id, `${field}.topic_id`),
    clientKey = optionalNullableString(body.client_key, `${field}.client_key`);
  if ((topicId === null) === (clientKey === null))
    throw new AppError(
      "validation_error",
      `${field} must contain exactly one of topic_id or client_key.`,
      400,
      { field },
    );
  return topicId
    ? { topic_id: topicId }
    : {
        client_key: requiredString(clientKey, `${field}.client_key`, 1, 80),
      };
}

function parseInsightEvidenceReference(
  value: unknown,
  field: string,
): KnowledgeInsightEvidenceReference {
  const body = requireObject(value),
    claimId = uuidOrNull(body.claim_id, `${field}.claim_id`),
    hasPageId = body.page_id !== undefined && body.page_id !== null,
    hasTitle = body.title !== undefined && body.title !== null;
  if (claimId) {
    if (hasPageId || hasTitle)
      throw new AppError(
        "validation_error",
        `${field} must contain either claim_id or a page reference, not both.`,
        400,
        { field },
      );
    return { claim_id: claimId };
  }
  return parsePageReference(body, field);
}

function parseInsightItems(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
  evidenceOptional = false,
): KnowledgeInsightItem[] {
  const values = boundedArray(value ?? [], field, maximum);
  if (values.length < minimum)
    throw new AppError(
      "validation_error",
      `${field} must contain at least ${minimum} item${minimum === 1 ? "" : "s"}.`,
      400,
      { field, minimum },
    );
  return values.map((value, index) => {
    const item = requireObject(value),
      evidence = boundedArray(
        item.evidence ?? [],
        `${field}[${index}].evidence`,
        6,
      ).map((reference, evidenceIndex) =>
        parseInsightEvidenceReference(
          reference,
          `${field}[${index}].evidence[${evidenceIndex}]`,
        ),
      );
    if (!evidenceOptional && evidence.length === 0)
      throw new AppError(
        "validation_error",
        `${field}[${index}].evidence must contain at least one reference.`,
        400,
        { field: `${field}[${index}].evidence` },
      );
    const keys = evidence.map((reference) =>
      "claim_id" in reference
        ? `claim:${reference.claim_id}`
        : reference.page_id
          ? `page:${reference.page_id}`
          : `title:${reference.title!.trim().toLocaleLowerCase()}`,
    );
    if (new Set(keys).size !== keys.length)
      throw new AppError(
        "validation_error",
        `${field}[${index}].evidence cannot contain duplicate references.`,
        400,
        { field: `${field}[${index}].evidence` },
      );
    return {
      statement: requiredString(
        item.statement,
        `${field}[${index}].statement`,
        1,
        500,
      ),
      explanation:
        item.explanation === null ||
        item.explanation === undefined ||
        item.explanation === ""
          ? null
          : requiredString(
              item.explanation,
              `${field}[${index}].explanation`,
              1,
              1_200,
            ),
      evidence,
    };
  });
}

function parseInsightBrief(
  value: unknown,
  field: string,
): KnowledgeInsightBrief {
  const body = requireObject(value);
  return {
    headline: requiredString(body.headline, `${field}.headline`, 1, 160),
    synthesis: requiredString(body.synthesis, `${field}.synthesis`, 1, 1_200),
    takeaways: parseInsightItems(body.takeaways, `${field}.takeaways`, 1, 5),
    tensions: parseInsightItems(body.tensions, `${field}.tensions`, 0, 3),
    implications: parseInsightItems(
      body.implications,
      `${field}.implications`,
      0,
      4,
    ),
    questions: parseInsightItems(
      body.questions,
      `${field}.questions`,
      0,
      4,
      true,
    ),
  };
}

export function parseKnowledgeMapPatch(value: unknown): KnowledgeMapPatch {
  const body = requireObject(value),
    topics = boundedArray(body.topics ?? [], "knowledge_map.topics", 50).map(
      (value, index) => {
        const topic = requireObject(value),
          parent =
            topic.parent === null || topic.parent === undefined
              ? null
              : parseTopicReference(
                  topic.parent,
                  `knowledge_map.topics[${index}].parent`,
                );
        return {
          client_key: requiredString(
            topic.client_key,
            `knowledge_map.topics[${index}].client_key`,
            1,
            80,
          ),
          topic_id: uuidOrNull(
            topic.topic_id,
            `knowledge_map.topics[${index}].topic_id`,
          ),
          parent,
          title: requiredString(
            topic.title,
            `knowledge_map.topics[${index}].title`,
            1,
            80,
          ),
          summary: requiredString(
            topic.summary,
            `knowledge_map.topics[${index}].summary`,
            1,
            240,
          ),
          presentation: exactEnum(
            topic.presentation,
            `knowledge_map.topics[${index}].presentation`,
            KNOWLEDGE_PRESENTATIONS,
          ),
          sort_order: requiredInteger(
            Number(topic.sort_order ?? index),
            `knowledge_map.topics[${index}].sort_order`,
            0,
            1_000_000,
          ),
        };
      },
    ),
    placements = boundedArray(
      body.placements ?? [],
      "knowledge_map.placements",
      100,
    ).map((value, index) => {
      const placement = requireObject(value);
      return {
        placement_id: uuidOrNull(
          placement.placement_id,
          `knowledge_map.placements[${index}].placement_id`,
        ),
        topic: parseTopicReference(
          placement.topic,
          `knowledge_map.placements[${index}].topic`,
        ),
        page: parsePageReference(
          placement.page,
          `knowledge_map.placements[${index}].page`,
        ),
        role: exactEnum(
          placement.role,
          `knowledge_map.placements[${index}].role`,
          KNOWLEDGE_PLACEMENT_ROLES,
        ),
        summary: requiredString(
          placement.summary,
          `knowledge_map.placements[${index}].summary`,
          1,
          240,
        ),
        sort_order: requiredInteger(
          Number(placement.sort_order ?? index),
          `knowledge_map.placements[${index}].sort_order`,
          0,
          1_000_000,
        ),
      };
    }),
    removePlacementIds = boundedArray(
      body.remove_placement_ids ?? [],
      "knowledge_map.remove_placement_ids",
      100,
    ).map((value, index) =>
      uuidOrNull(value, `knowledge_map.remove_placement_ids[${index}]`),
    );
  const clientKeys = topics.map((topic) => topic.client_key);
  if (new Set(clientKeys).size !== clientKeys.length)
    throw new AppError(
      "validation_error",
      "knowledge_map topic client_key values must be unique.",
      400,
      { field: "knowledge_map.topics.client_key" },
    );
  const result: KnowledgeMapPatch = {
    expected_version: requiredInteger(
      Number(body.expected_version ?? 0),
      "knowledge_map.expected_version",
      0,
    ),
    topics,
    placements,
    remove_placement_ids: removePlacementIds.filter(
      (value): value is string => value !== null,
    ),
  };
  if (Object.prototype.hasOwnProperty.call(body, "overview_brief"))
    result.overview_brief =
      body.overview_brief === null
        ? null
        : parseInsightBrief(
            body.overview_brief,
            "knowledge_map.overview_brief",
          );
  if (Object.prototype.hasOwnProperty.call(body, "topic_briefs"))
    result.topic_briefs = boundedArray(
      body.topic_briefs,
      "knowledge_map.topic_briefs",
      50,
    ).map((value, index) => {
      const item = requireObject(value);
      return {
        topic: parseTopicReference(
          item.topic,
          `knowledge_map.topic_briefs[${index}].topic`,
        ),
        brief:
          item.brief === null
            ? null
            : parseInsightBrief(
                item.brief,
                `knowledge_map.topic_briefs[${index}].brief`,
              ),
      };
    });
  return result;
}
