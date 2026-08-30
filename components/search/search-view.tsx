"use client";

import { ArrowUpRight, FileText, Search, X } from "lucide-react";

import type { KnowledgeTreePage } from "@/components/layout/knowledge-tree";

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
  return (
    <section className="search-view">
      <header className="view-heading">
        <div className="view-heading-icon">
          <Search />
        </div>
        <div>
          <h1>Search</h1>
          <p>제목과 Markdown 본문에서 지식을 찾습니다.</p>
        </div>
      </header>
      <label className="search-view-input">
        <Search aria-hidden="true" />
        <input
          autoFocus
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search the wiki…"
          aria-label="위키 검색"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            aria-label="검색어 지우기"
          >
            <X />
          </button>
        )}
      </label>
      <div className="search-summary">
        <span>{query.trim() ? `“${query.trim()}”` : "All pages"}</span>
        <b>{pages.length} results</b>
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
            <strong>일치하는 페이지가 없습니다.</strong>
            <p>다른 단어로 검색하거나 새 페이지를 만들어 보세요.</p>
          </div>
        )}
      </div>
    </section>
  );
}
