"use client";

import { ArrowUpRight, FileText, Search, X } from "lucide-react";

import type { KnowledgeTreePage } from "@/components/layout/knowledge-tree";
import { useI18n } from "@/components/i18n-provider";

type SearchPage = KnowledgeTreePage & { markdown: string; updated_at: string };

function excerpt(markdown: string, query: string) {
  const plain = markdown
    .replace(/^---[\s\S]*?---/m, "")
    .replace(/[#>*_`\[\]()!-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!query.trim()) return plain.slice(0, 180);
  const index = plain.toLowerCase().indexOf(query.trim().toLowerCase());
  const start = Math.max(0, index < 0 ? 0 : index - 55);
  return `${start > 0 ? "…" : ""}${plain.slice(start, start + 180)}${plain.length > start + 180 ? "…" : ""}`;
}

export function SearchView({
  query,
  pages,
  onQueryChange,
  onOpenPage,
}: {
  query: string;
  pages: SearchPage[];
  onQueryChange: (query: string) => void;
  onOpenPage: (pageId: string) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="search-view">
      <header className="view-heading">
        <div className="view-heading-icon">
          <Search />
        </div>
        <div>
          <h1>{t("search.title")}</h1>
          <p>{t("search.description")}</p>
        </div>
      </header>
      <label className="search-view-input">
        <Search aria-hidden="true" />
        <input
          autoFocus
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t("search.placeholder")}
          aria-label={t("search.aria")}
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            aria-label={t("search.clear")}
          >
            <X />
          </button>
        )}
      </label>
      <div className="search-summary">
        <span>{query.trim() ? `“${query.trim()}”` : t("search.allPages")}</span>
        <b>{t("search.results", { count: pages.length })}</b>
      </div>
      <div className="search-results">
        {pages.map((page) => (
          <button
            type="button"
            key={page.id}
            onClick={() => onOpenPage(page.id)}
          >
            <FileText />
            <span>
              <strong>{page.title}</strong>
              <small>
                {page.page_type} · v{page.version}
              </small>
              <p>{excerpt(page.markdown, query)}</p>
            </span>
            <ArrowUpRight />
          </button>
        ))}
        {pages.length === 0 && (
          <div className="empty-view">
            <Search />
            <strong>{t("search.empty")}</strong>
            <p>{t("search.emptyHint")}</p>
          </div>
        )}
      </div>
    </section>
  );
}
