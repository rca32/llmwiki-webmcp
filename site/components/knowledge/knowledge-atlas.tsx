"use client";

import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  CircleHelp,
  FileText,
  GitCompareArrows,
  Layers3,
  Link2,
  Lock,
  Network,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { useI18n } from "@/components/i18n-provider";

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

const presentationMeta = {
  cluster: { label: "CLUSTER", icon: Layers3 },
  sequence: { label: "SEQUENCE", icon: ArrowRight },
  comparison: { label: "COMPARE", icon: GitCompareArrows },
  questions: { label: "QUESTIONS", icon: CircleHelp },
  evidence: { label: "EVIDENCE", icon: ShieldCheck },
} as const;

export function KnowledgeAtlas({
  map,
  selectedTopicId,
  canWrite,
  onSelectTopic,
  onOpenPage,
  onRenameTopic,
  onMoveTopic,
  onSetTopicLocked,
  onMovePlacement,
  onDuplicatePlacement,
  onRemovePlacement,
}: {
  map: KnowledgeMapData;
  selectedTopicId: string | null;
  canWrite: boolean;
  onSelectTopic: (topicId: string | null) => void;
  onOpenPage: (pageId: string) => void;
  onRenameTopic: (topic: KnowledgeTopic, title: string) => void;
  onMoveTopic: (topic: KnowledgeTopic, parentTopicId: string | null) => void;
  onSetTopicLocked: (topic: KnowledgeTopic, locked: boolean) => void;
  onMovePlacement: (placement: KnowledgePlacement, topicId: string) => void;
  onDuplicatePlacement: (
    placement: KnowledgePlacement,
    topicId: string,
  ) => void;
  onRemovePlacement: (placement: KnowledgePlacement) => void;
}) {
  const { t } = useI18n();
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(
    () => new Set(),
  );
  const topicById = new Map(map.topics.map((topic) => [topic.id, topic])),
    selected = selectedTopicId
      ? (topicById.get(selectedTopicId) ?? null)
      : null,
    parentId = selected?.id ?? null,
    childTopics = map.topics.filter(
      (topic) => topic.parent_topic_id === parentId,
    ),
    visibleTopics = childTopics.length
      ? childTopics
      : selected
        ? [selected]
        : [],
    breadcrumbs: KnowledgeTopic[] = [];
  let breadcrumbCursor = selected;
  for (let depth = 0; breadcrumbCursor && depth < 4; depth += 1) {
    breadcrumbs.unshift(breadcrumbCursor);
    breadcrumbCursor = breadcrumbCursor.parent_topic_id
      ? (topicById.get(breadcrumbCursor.parent_topic_id) ?? null)
      : null;
  }

  function renameTopic(topic: KnowledgeTopic) {
    const next = window.prompt(t("atlas.topicName"), topic.title)?.trim();
    if (next && next !== topic.title) onRenameTopic(topic, next);
  }

  return (
    <section className="knowledge-atlas" aria-label="Knowledge Atlas">
      <header className="atlas-hero">
        <div>
          <span className="atlas-eyebrow">
            <Network /> KNOWLEDGE ATLAS · v{map.version}
          </span>
          <h1>{selected?.title ?? t("atlas.overviewTitle")}</h1>
          <p>
            {selected?.summary ?? t("atlas.overviewDescription")}
          </p>
        </div>
        <div className="atlas-stat-grid" aria-label={t("atlas.summary")}>
          <span>
            <strong>{map.topics.length}</strong>
            {t("atlas.topics")}
          </span>
          <span>
            <strong>{map.placements.length}</strong>
            {t("atlas.placements")}
          </span>
          <span className={map.unmapped_pages.length ? "needs-attention" : ""}>
            <strong>{map.unmapped_pages.length}</strong>
            {t("atlas.needsOrganizing")}
          </span>
          <span className={map.warnings.length ? "needs-attention" : ""}>
            <strong>{map.warnings.length}</strong>
            {t("atlas.warnings")}
          </span>
        </div>
      </header>

      <nav className="atlas-breadcrumbs" aria-label={t("atlas.semanticPath")}>
        <button type="button" onClick={() => onSelectTopic(null)}>
          {t("atlas.all")}
        </button>
        {breadcrumbs.map((topic) => (
          <span key={topic.id}>
            <ChevronRight />
            <button type="button" onClick={() => onSelectTopic(topic.id)}>
              {topic.title}
            </button>
          </span>
        ))}
      </nav>

      <div className="atlas-topic-grid">
        {visibleTopics.map((topic) => {
          const meta = presentationMeta[topic.presentation],
            Icon = meta.icon,
            children = map.topics.filter(
              (candidate) => candidate.parent_topic_id === topic.id,
            ),
            placements = map.placements.filter(
              (placement) => placement.topic_id === topic.id,
            ),
            topicWarnings = map.warnings.filter(
              (warning) => warning.topic_id === topic.id,
            ),
            expanded = expandedTopics.has(topic.id),
            visiblePlacements = expanded ? placements : placements.slice(0, 5);
          return (
            <article
              className={`atlas-topic-card presentation-${topic.presentation}`}
              key={topic.id}
              onDragOver={(event) => {
                if (
                  event.dataTransfer.types.includes(
                    "application/x-knowledge-placement",
                  )
                )
                  event.preventDefault();
              }}
              onDrop={(event) => {
                const placementId = event.dataTransfer.getData(
                  "application/x-knowledge-placement",
                );
                const placement = map.placements.find(
                  (candidate) => candidate.id === placementId,
                );
                if (placement && placement.topic_id !== topic.id)
                  onMovePlacement(placement, topic.id);
              }}
            >
              <header>
                <button
                  type="button"
                  className="atlas-topic-open"
                  onClick={() => onSelectTopic(topic.id)}
                >
                  <span className="atlas-topic-kind">
                    <Icon /> {meta.label}
                  </span>
                  <span
                    className={`atlas-topic-status ${topicWarnings.length ? "warning" : ""}`}
                  >
                    {topicWarnings.length
                      ? t("atlas.warningCount", {
                          count: topicWarnings.length,
                        })
                      : t("atlas.healthy")}
                  </span>
                  <strong>{topic.title}</strong>
                  <p>{topic.summary}</p>
                </button>
                {topic.is_locked && (
                  <Lock
                    className="atlas-lock"
                    aria-label={t("atlas.userLocked")}
                  />
                )}
                {canWrite && (
                  <details className="atlas-topic-actions">
                    <summary
                      aria-label={t("atlas.editTopic", { title: topic.title })}
                    >
                      •••
                    </summary>
                    <div>
                      <button type="button" onClick={() => renameTopic(topic)}>
                        <Pencil /> {t("atlas.rename")}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onSetTopicLocked(topic, !topic.is_locked)
                        }
                      >
                        <Lock />
                        {topic.is_locked
                          ? t("atlas.unlockTopic")
                          : t("atlas.lockTopic")}
                      </button>
                      <label>
                        <span>{t("atlas.moveParent")}</span>
                        <select
                          value={topic.parent_topic_id ?? ""}
                          onChange={(event) =>
                            onMoveTopic(topic, event.target.value || null)
                          }
                        >
                          <option value="">{t("atlas.topLevel")}</option>
                          {map.topics
                            .filter((candidate) => candidate.id !== topic.id)
                            .map((candidate) => (
                              <option key={candidate.id} value={candidate.id}>
                                {candidate.title}
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>
                  </details>
                )}
              </header>

              {topic.presentation === "sequence" ? (
                <ol className="atlas-item-list sequence-list">
                  {visiblePlacements.map((placement) => (
                    <AtlasPlacement
                      key={placement.id}
                      placement={placement}
                      topics={map.topics}
                      canWrite={canWrite}
                      onOpenPage={onOpenPage}
                      onMovePlacement={onMovePlacement}
                      onDuplicatePlacement={onDuplicatePlacement}
                      onRemovePlacement={onRemovePlacement}
                    />
                  ))}
                </ol>
              ) : (
                <div
                  className={`atlas-item-list ${topic.presentation === "comparison" ? "comparison-list" : ""}`}
                >
                  {visiblePlacements.map((placement) => (
                    <AtlasPlacement
                      key={placement.id}
                      placement={placement}
                      topics={map.topics}
                      canWrite={canWrite}
                      onOpenPage={onOpenPage}
                      onMovePlacement={onMovePlacement}
                      onDuplicatePlacement={onDuplicatePlacement}
                      onRemovePlacement={onRemovePlacement}
                    />
                  ))}
                </div>
              )}

              {!placements.length && (
                <p className="atlas-empty-card">{t("atlas.empty")}</p>
              )}
              {placements.length > 5 && (
                <button
                  type="button"
                  className="atlas-expand"
                  onClick={() =>
                    setExpandedTopics((current) => {
                      const next = new Set(current);
                      if (next.has(topic.id)) next.delete(topic.id);
                      else next.add(topic.id);
                      return next;
                    })
                  }
                >
                  {expanded
                    ? t("atlas.coreOnly")
                    : t("atlas.showMore", { count: placements.length - 5 })}
                </button>
              )}
              {!!children.length && (
                <footer className="atlas-child-topics">
                  <span>{t("atlas.childTopics")}</span>
                  {children.slice(0, 4).map((child) => (
                    <button
                      type="button"
                      key={child.id}
                      onClick={() => onSelectTopic(child.id)}
                    >
                      {child.title} <ChevronRight />
                    </button>
                  ))}
                </footer>
              )}
            </article>
          );
        })}
      </div>

      {!!map.unmapped_pages.length && (
        <section className="atlas-unmapped">
          <header>
            <div>
              <span>NEEDS ORGANIZING</span>
              <h2>{t("atlas.needsOrganizing")}</h2>
            </div>
            <b>{map.unmapped_pages.length}</b>
          </header>
          <div>
            {map.unmapped_pages.map((page) => (
              <button
                type="button"
                key={page.id}
                onClick={() => onOpenPage(page.id)}
              >
                <FileText />
                <span>
                  <strong>{page.title}</strong>
                  <small>{page.page_type}</small>
                </span>
                <ChevronRight />
              </button>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

function AtlasPlacement({
  placement,
  topics,
  canWrite,
  onOpenPage,
  onMovePlacement,
  onDuplicatePlacement,
  onRemovePlacement,
}: {
  placement: KnowledgePlacement;
  topics: KnowledgeTopic[];
  canWrite: boolean;
  onOpenPage: (pageId: string) => void;
  onMovePlacement: (placement: KnowledgePlacement, topicId: string) => void;
  onDuplicatePlacement: (
    placement: KnowledgePlacement,
    topicId: string,
  ) => void;
  onRemovePlacement: (placement: KnowledgePlacement) => void;
}) {
  const { t } = useI18n();
  const [targetTopicId, setTargetTopicId] = useState("");
  return (
    <div
      className={`atlas-placement role-${placement.role}`}
      draggable={canWrite}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(
          "application/x-knowledge-placement",
          placement.id,
        );
      }}
    >
      <button type="button" onClick={() => onOpenPage(placement.page_id)}>
        {placement.page.page_type === "source" ? <BookOpen /> : <FileText />}
        <span>
          <small>{placement.role}</small>
          <strong>{placement.page.title}</strong>
          <p>{placement.summary}</p>
        </span>
        <ChevronRight />
      </button>
      <details className="atlas-evidence">
        <summary>
          <Link2 />
          {t("atlas.evidenceSummary", {
            claims: placement.evidence.claim_count,
            sources: placement.evidence.source_count,
          })}
        </summary>
        <div>
          <span>
            {t("atlas.averageConfidence", {
              value:
                placement.evidence.average_confidence === null
                  ? "—"
                  : `${Math.round(placement.evidence.average_confidence * 100)}%`,
            })}
          </span>
          {!!placement.evidence.expired_count && (
            <span>
              {t("atlas.expiredCount", {
                count: placement.evidence.expired_count,
              })}
            </span>
          )}
          {!!placement.evidence.superseded_count && (
            <span>
              {t("atlas.supersededCount", {
                count: placement.evidence.superseded_count,
              })}
            </span>
          )}
        </div>
      </details>
      {canWrite && (
        <div className="atlas-placement-actions">
          <select
            value={targetTopicId}
            aria-label={t("atlas.showInOtherTopic", {
              title: placement.page.title,
            })}
            onChange={(event) => setTargetTopicId(event.target.value)}
          >
            <option value="">{t("atlas.selectTopic")}</option>
            {topics
              .filter((topic) => topic.id !== placement.topic_id)
              .map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.title}
                </option>
              ))}
          </select>
          <button
            type="button"
            disabled={!targetTopicId}
            onClick={() => {
              if (targetTopicId) onMovePlacement(placement, targetTopicId);
              setTargetTopicId("");
            }}
            aria-label={t("atlas.moveToSelected")}
            title={t("atlas.moveToSelected")}
          >
            <ArrowRight />
          </button>
          <button
            type="button"
            disabled={!targetTopicId}
            onClick={() => {
              if (targetTopicId) onDuplicatePlacement(placement, targetTopicId);
              setTargetTopicId("");
            }}
            aria-label={t("atlas.showInSelected")}
            title={t("atlas.showInAnother")}
          >
            <Plus />
          </button>
          <button
            type="button"
            onClick={() => onRemovePlacement(placement)}
            aria-label={t("atlas.remove")}
          >
            <Trash2 />
          </button>
        </div>
      )}
    </div>
  );
}
