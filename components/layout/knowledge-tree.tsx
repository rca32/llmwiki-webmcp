"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  Boxes,
  ChevronDown,
  ChevronRight,
  CircleDot,
  FileText,
  FolderTree,
  Globe,
  Lightbulb,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";

export type KnowledgeTreePage = {
  id: string;
  title: string;
  page_type: string;
  version: number;
  path: string;
};

const typeOrder = [
  "overview",
  "concept",
  "entity",
  "note",
  "source",
  "synthesis",
  "other",
];

function typeConfig(type: string) {
  const configs: Record<
    string,
    { label: string; icon: typeof FileText; className: string }
  > = {
    overview: { label: "Overview", icon: Globe, className: "type-overview" },
    concept: { label: "Concepts", icon: Lightbulb, className: "type-concept" },
    entity: { label: "Entities", icon: CircleDot, className: "type-entity" },
    note: { label: "Notes", icon: FileText, className: "type-note" },
    source: { label: "Sources", icon: BookOpen, className: "type-source" },
    synthesis: { label: "Synthesis", icon: Boxes, className: "type-synthesis" },
    other: { label: "Other", icon: FolderTree, className: "type-other" },
  };
  return (
    configs[type] ?? {
      label: type.charAt(0).toUpperCase() + type.slice(1),
      icon: FileText,
      className: "type-other",
    }
  );
}

export function KnowledgeTree({
  pages,
  deletedPages,
  activePageId,
  query,
  canWrite,
  onQueryChange,
  onOpenPage,
  onCreatePage,
  onRestorePage,
}: {
  pages: KnowledgeTreePage[];
  deletedPages: KnowledgeTreePage[];
  activePageId: string | null;
  query: string;
  canWrite: boolean;
  onQueryChange: (query: string) => void;
  onOpenPage: (pageId: string) => void;
  onCreatePage: () => void;
  onRestorePage: (page: KnowledgeTreePage) => void;
}) {
  const [expandedTypes, setExpandedTypes] = useState(() => new Set(typeOrder));
  const [trashOpen, setTrashOpen] = useState(false);
  const grouped = useMemo(() => {
    const result = new Map<string, KnowledgeTreePage[]>();
    for (const page of pages) {
      const type = page.page_type || "other";
      const group = result.get(type) ?? [];
      group.push(page);
      result.set(type, group);
    }
    return [...result.entries()]
      .map(
        ([type, items]) =>
          [
            type,
            items.sort((a, b) => a.title.localeCompare(b.title, "ko")),
          ] as const,
      )
      .sort(([typeA], [typeB]) => {
        const a = typeOrder.indexOf(typeA);
        const b = typeOrder.indexOf(typeB);
        return (a < 0 ? 99 : a) - (b < 0 ? 99 : b);
      });
  }, [pages]);

  function toggleType(type: string) {
    setExpandedTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  return (
    <section className="knowledge-tree-shell" aria-label="Knowledge Tree">
      <header className="tree-header">
        <div>
          <strong>Liminal Wiki</strong>
          <span>{pages.length} pages</span>
        </div>
        <button
          type="button"
          className="tree-action"
          onClick={onCreatePage}
          disabled={!canWrite}
          aria-label="새 페이지"
          title="새 페이지"
        >
          <Plus />
        </button>
      </header>

      <label className="tree-search">
        <Search aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search pages"
          aria-label="페이지 검색"
        />
        <kbd>⌘K</kbd>
      </label>

      <ScrollArea className="tree-scroll-area">
        <div className="tree-content">
          <p className="tree-label">Knowledge</p>
          {grouped.length === 0 && (
            <p className="tree-empty">표시할 페이지가 없습니다.</p>
          )}
          {grouped.map(([type, items]) => {
            const config = typeConfig(type);
            const Icon = config.icon;
            const expanded = expandedTypes.has(type);
            return (
              <div className="tree-group" key={type}>
                <button
                  type="button"
                  className="tree-group-heading"
                  onClick={() => toggleType(type)}
                  aria-expanded={expanded}
                >
                  {expanded ? <ChevronDown /> : <ChevronRight />}
                  <Icon className={config.className} />
                  <span>{config.label}</span>
                  <b>{items.length}</b>
                </button>
                {expanded && (
                  <div className="tree-group-items">
                    {items.map((page) => (
                      <button
                        type="button"
                        key={page.id}
                        className={`tree-page-row ${activePageId === page.id ? "active" : ""}`}
                        onClick={() => onOpenPage(page.id)}
                        title={page.path}
                        onKeyDown={(event) => {
                          if (
                            !["ArrowDown", "ArrowUp", "Home", "End"].includes(
                              event.key,
                            )
                          )
                            return;
                          event.preventDefault();
                          const rows = Array.from(
                            event.currentTarget
                              .closest(".tree-content")
                              ?.querySelectorAll<HTMLButtonElement>(
                                ".tree-page-row:not(.deleted)",
                              ) ?? [],
                          );
                          const index = rows.indexOf(event.currentTarget);
                          const nextIndex =
                            event.key === "Home"
                              ? 0
                              : event.key === "End"
                                ? rows.length - 1
                                : event.key === "ArrowDown"
                                  ? Math.min(index + 1, rows.length - 1)
                                  : Math.max(index - 1, 0);
                          rows[nextIndex]?.focus();
                        }}
                      >
                        <FileText aria-hidden="true" />
                        <span>{page.title}</span>
                        <small>v{page.version}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {deletedPages.length > 0 && (
            <div className="tree-group tree-trash">
              <button
                type="button"
                className="tree-group-heading"
                onClick={() => setTrashOpen((value) => !value)}
                aria-expanded={trashOpen}
              >
                {trashOpen ? <ChevronDown /> : <ChevronRight />}
                <Trash2 />
                <span>Trash</span>
                <b>{deletedPages.length}</b>
              </button>
              {trashOpen && (
                <div className="tree-group-items">
                  {deletedPages.map((page) => (
                    <button
                      type="button"
                      key={page.id}
                      className="tree-page-row deleted"
                      onClick={() => onRestorePage(page)}
                    >
                      <Trash2 />
                      <span>{page.title}</span>
                      <small>복구</small>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      <footer className="tree-footer">
        <span className="status-dot" />
        <span>Site tools connected</span>
      </footer>
    </section>
  );
}
