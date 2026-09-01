"use client";

import type { ReactNode } from "react";

import { MarkdownPreview } from "@/app/markdown-preview";
import { useI18n } from "@/components/i18n-provider";

export function WikiReader({
  title,
  pageType,
  version,
  markdown,
  headerActions,
  alerts,
  onWikiLink,
}: {
  title: string;
  pageType: string;
  version: number | null;
  markdown: string;
  headerActions?: ReactNode;
  alerts?: ReactNode;
  onWikiLink: (title: string) => void;
}) {
  const { t } = useI18n();
  return (
    <article className="wiki-editor">
      <header className="editor-titlebar">
        <div className="editor-title-copy">
          <span>{pageType || "WIKI PAGE"}</span>
          <h1>{title || t("common.untitled")}</h1>
        </div>
        <div className="editor-title-actions">{headerActions}</div>
      </header>
      {alerts}
      <div className="editor-surface preview">
        <MarkdownPreview value={markdown} onWikiLink={onWikiLink} />
      </div>
      <footer className="editor-statusbar">
        <div>
          <span>Markdown</span>
          <span>
            {markdown.length.toLocaleString()} {t("editor.chars")}
          </span>
          <span>v{version ?? "—"}</span>
        </div>
      </footer>
    </article>
  );
}
