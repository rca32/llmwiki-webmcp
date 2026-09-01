"use client";

import {
  BookOpen,
  ChevronRight,
  CircleHelp,
  FileText,
  Layers3,
  Lightbulb,
  Link2,
  Network,
  Scale,
  Target,
} from "lucide-react";

import { useI18n, type TranslationKey } from "@/components/i18n-provider";

export type InsightEvidence =
  | {
      kind: "page";
      page_id: string;
      status: "current" | "missing";
      page: {
        id: string;
        title: string;
        page_type: string;
        version: number;
        path: string;
      } | null;
    }
  | {
      kind: "claim";
      claim_id: string;
      status: "current" | "expired" | "superseded" | "missing";
      evidence_fragment: string | null;
      confidence: number | null;
      subject_page_id: string | null;
      source_page: {
        id: string;
        title: string;
        page_type: string | null;
        version: number;
        path: string | null;
      } | null;
    };

export type InsightItem = {
  statement: string;
  explanation: string | null;
  evidence: InsightEvidence[];
};

export type InsightBrief = {
  headline: string;
  synthesis: string;
  takeaways: InsightItem[];
  tensions: InsightItem[];
  implications: InsightItem[];
  questions: InsightItem[];
};

export type KnowledgeTopic = {
  id: string;
  parent_topic_id: string | null;
  title: string;
  summary: string;
  presentation:
    | "cluster"
    | "sequence"
    | "comparison"
    | "questions"
    | "evidence";
  sort_order: number;
  is_locked: boolean;
  insight_brief: InsightBrief | null;
  insight_brief_status: "current" | "stale" | "missing";
};

export type KnowledgePlacement = {
  id: string;
  topic_id: string;
  page_id: string;
  role: "primary" | "supporting" | "evidence" | "question";
  summary: string;
  sort_order: number;
  is_locked: boolean;
  page: {
    id: string;
    title: string;
    page_type: string;
    version: number;
    path: string;
  };
  evidence: {
    claim_count: number;
    source_count: number;
    average_confidence: number | null;
    expired_count: number;
    superseded_count: number;
  };
};

export type KnowledgeMapData = {
  exists: boolean;
  version: number;
  overview_brief: InsightBrief | null;
  overview_brief_status: "current" | "stale" | "missing";
  topics: KnowledgeTopic[];
  placements: KnowledgePlacement[];
  unmapped_pages: Array<{
    id: string;
    title: string;
    page_type: string;
    version: number;
    path: string;
  }>;
  warnings: Array<{
    code: string;
    page_id: string | null;
    topic_id: string | null;
    message: string;
  }>;
};

const roleRank: Record<KnowledgePlacement["role"], number> = {
  primary: 0,
  supporting: 1,
  evidence: 2,
  question: 3,
};

export function KnowledgeAtlas({
  map,
  selectedTopicId,
  onSelectTopic,
  onOpenPage,
}: {
  map: KnowledgeMapData;
  selectedTopicId: string | null;
  onSelectTopic: (topicId: string | null) => void;
  onOpenPage: (pageId: string) => void;
}) {
  const { t } = useI18n(),
    topicById = new Map(map.topics.map((topic) => [topic.id, topic])),
    selected = selectedTopicId
      ? (topicById.get(selectedTopicId) ?? null)
      : null,
    brief = selected?.insight_brief ?? (!selected ? map.overview_brief : null),
    breadcrumbs: KnowledgeTopic[] = [];
  let cursor = selected;
  for (let depth = 0; cursor && depth < 4; depth += 1) {
    breadcrumbs.unshift(cursor);
    cursor = cursor.parent_topic_id
      ? (topicById.get(cursor.parent_topic_id) ?? null)
      : null;
  }

  const directPlacements = selected
      ? map.placements
          .filter((placement) => placement.topic_id === selected.id)
          .sort(
            (a, b) =>
              roleRank[a.role] - roleRank[b.role] ||
              a.sort_order - b.sort_order,
          )
      : [],
    relatedTopics = selected
      ? map.topics.filter(
          (topic) =>
            topic.parent_topic_id === selected.id ||
            (topic.parent_topic_id === selected.parent_topic_id &&
              topic.id !== selected.id),
        )
      : [];

  return (
    <article className="insight-reader" aria-label={t("nav.knowledge")}>
      <nav className="insight-breadcrumbs" aria-label={t("atlas.semanticPath")}>
        <button type="button" onClick={() => onSelectTopic(null)}>
          {t("atlas.all")}
        </button>
        {breadcrumbs.map((topic) => (
          <span key={topic.id}>
            <ChevronRight aria-hidden="true" />
            <button type="button" onClick={() => onSelectTopic(topic.id)}>
              {topic.title}
            </button>
          </span>
        ))}
      </nav>

      <header className="insight-hero">
        <span className="insight-eyebrow">
          <Network aria-hidden="true" /> {t("atlas.insightBrief")}
        </span>
        <h1>
          {brief?.headline ?? selected?.title ?? t("atlas.overviewTitle")}
        </h1>
        <p>
          {brief?.synthesis ??
            selected?.summary ??
            t("atlas.overviewDescription")}
        </p>
      </header>

      {brief ? (
        <div className="insight-report">
          <InsightSection
            title={t("atlas.takeaways")}
            icon={Lightbulb}
            items={brief.takeaways}
            onOpenPage={onOpenPage}
          />
          {!!brief.tensions.length && (
            <InsightSection
              title={t("atlas.tensions")}
              icon={Scale}
              items={brief.tensions}
              onOpenPage={onOpenPage}
            />
          )}
          {!!brief.implications.length && (
            <InsightSection
              title={t("atlas.implications")}
              icon={Target}
              items={brief.implications}
              onOpenPage={onOpenPage}
            />
          )}
          {!!brief.questions.length && (
            <InsightSection
              title={t("atlas.openQuestions")}
              icon={CircleHelp}
              items={brief.questions}
              onOpenPage={onOpenPage}
            />
          )}
        </div>
      ) : (
        <LegacyTopicSummary
          map={map}
          selected={selected}
          onSelectTopic={onSelectTopic}
          onOpenPage={onOpenPage}
        />
      )}

      {selected && !!directPlacements.length && (
        <section
          className="insight-footer-section"
          aria-labelledby="key-documents"
        >
          <h2 id="key-documents">{t("atlas.keyDocuments")}</h2>
          <div className="insight-document-list">
            {directPlacements.slice(0, 5).map((placement) => (
              <button
                type="button"
                key={placement.id}
                onClick={() => onOpenPage(placement.page_id)}
              >
                {placement.page.page_type === "source" ? (
                  <BookOpen aria-hidden="true" />
                ) : (
                  <FileText aria-hidden="true" />
                )}
                <span>
                  <strong>{placement.page.title}</strong>
                  <small>{placement.summary}</small>
                </span>
                <ChevronRight aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      )}

      {selected ? (
        !!relatedTopics.length && (
          <TopicList
            title={t("atlas.relatedTopics")}
            topics={relatedTopics}
            onSelectTopic={onSelectTopic}
          />
        )
      ) : brief ? (
        <TopicList
          title={t("atlas.topicGuide")}
          topics={map.topics.filter((topic) => !topic.parent_topic_id)}
          onSelectTopic={onSelectTopic}
        />
      ) : null}
    </article>
  );
}

function InsightSection({
  title,
  icon: Icon,
  items,
  onOpenPage,
}: {
  title: string;
  icon: typeof Lightbulb;
  items: InsightItem[];
  onOpenPage: (pageId: string) => void;
}) {
  return (
    <section className="insight-section">
      <h2>
        <Icon aria-hidden="true" /> {title}
      </h2>
      <ol>
        {items.map((item, index) => (
          <li key={`${item.statement}-${index}`}>
            <strong>{item.statement}</strong>
            {item.explanation && <p>{item.explanation}</p>}
            {!!item.evidence.length && (
              <EvidenceDetails
                evidence={item.evidence}
                onOpenPage={onOpenPage}
              />
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function EvidenceDetails({
  evidence,
  onOpenPage,
}: {
  evidence: InsightEvidence[];
  onOpenPage: (pageId: string) => void;
}) {
  const { t } = useI18n(),
    titles = evidence
      .map((item) =>
        item.kind === "page" ? item.page?.title : item.source_page?.title,
      )
      .filter((title): title is string => Boolean(title)),
    summary = titles.length
      ? `${titles.slice(0, 2).join(", ")}${titles.length > 2 ? ` +${titles.length - 2}` : ""}`
      : t("atlas.evidenceUnavailable");
  return (
    <details className="insight-evidence">
      <summary>
        <Link2 aria-hidden="true" />
        <span>{summary}</span>
        <small>{t("atlas.sourceCount", { count: evidence.length })}</small>
      </summary>
      <div className="insight-evidence-list">
        {evidence.map((item) => {
          const page = item.kind === "page" ? item.page : item.source_page,
            statusKey =
              `atlas.evidenceStatus${item.status.charAt(0).toUpperCase()}${item.status.slice(1)}` as TranslationKey;
          return (
            <article key={item.kind === "page" ? item.page_id : item.claim_id}>
              <header>
                {page ? (
                  <button type="button" onClick={() => onOpenPage(page.id)}>
                    {page.title} <ChevronRight aria-hidden="true" />
                  </button>
                ) : (
                  <strong>{t("atlas.evidenceUnavailable")}</strong>
                )}
                <span data-status={item.status}>{t(statusKey)}</span>
              </header>
              {item.kind === "claim" && item.evidence_fragment && (
                <blockquote>{item.evidence_fragment}</blockquote>
              )}
              {item.kind === "claim" && item.confidence !== null && (
                <small>
                  {t("atlas.confidence", {
                    value: `${Math.round(item.confidence * 100)}%`,
                  })}
                </small>
              )}
            </article>
          );
        })}
      </div>
    </details>
  );
}

function LegacyTopicSummary({
  map,
  selected,
  onSelectTopic,
  onOpenPage,
}: {
  map: KnowledgeMapData;
  selected: KnowledgeTopic | null;
  onSelectTopic: (topicId: string | null) => void;
  onOpenPage: (pageId: string) => void;
}) {
  const { t } = useI18n(),
    topics = selected
      ? [selected]
      : map.topics.filter((topic) => !topic.parent_topic_id);
  return (
    <section className="legacy-insight-list" aria-label={t("atlas.topicGuide")}>
      {topics.map((topic) => {
        const pages = map.placements
          .filter((placement) => placement.topic_id === topic.id)
          .sort(
            (a, b) =>
              roleRank[a.role] - roleRank[b.role] ||
              a.sort_order - b.sort_order,
          )
          .slice(0, 3);
        if (!pages.length && !topic.summary) return null;
        return (
          <article key={topic.id}>
            {!selected && (
              <button
                type="button"
                className="legacy-topic-open"
                onClick={() => onSelectTopic(topic.id)}
              >
                <Layers3 aria-hidden="true" />
                <span>
                  <strong>{topic.title}</strong>
                  <small>{topic.summary}</small>
                </span>
                <ChevronRight aria-hidden="true" />
              </button>
            )}
            {!!pages.length && (
              <div className="legacy-document-row">
                {pages.map((placement) => (
                  <button
                    type="button"
                    key={placement.id}
                    onClick={() => onOpenPage(placement.page_id)}
                  >
                    <FileText aria-hidden="true" /> {placement.page.title}
                  </button>
                ))}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}

function TopicList({
  title,
  topics,
  onSelectTopic,
}: {
  title: string;
  topics: KnowledgeTopic[];
  onSelectTopic: (topicId: string) => void;
}) {
  if (!topics.length) return null;
  return (
    <section className="insight-topic-list">
      <h2>{title}</h2>
      <div>
        {topics.map((topic) => (
          <button
            type="button"
            key={topic.id}
            onClick={() => onSelectTopic(topic.id)}
          >
            <span>
              <strong>{topic.title}</strong>
              <small>{topic.summary}</small>
            </span>
            <ChevronRight aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}
