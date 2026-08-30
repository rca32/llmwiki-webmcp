"use client";

import type { ReactNode } from "react";
import { Eye, Pause, Pencil, Play, Save } from "lucide-react";

import { MarkdownPreview } from "@/app/markdown-preview";

export function WikiEditor({
  title,
  pageType,
  version,
  markdown,
  mode,
  dirty,
  canWrite,
  autosavePaused,
  headerActions,
  alerts,
  onModeChange,
  onMarkdownChange,
  onAutosaveToggle,
  onSave,
  onWikiLink,
}: {
  title: string;
  pageType: string;
  version: number | null;
  markdown: string;
  mode: "edit" | "preview";
  dirty: boolean;
  canWrite: boolean;
  autosavePaused: boolean;
  headerActions?: ReactNode;
  alerts?: ReactNode;
  onModeChange: (mode: "edit" | "preview") => void;
  onMarkdownChange: (markdown: string) => void;
  onAutosaveToggle: () => void;
  onSave: () => void;
  onWikiLink: (title: string) => void;
}) {
  return (
    <article className="wiki-editor">
      <header className="editor-titlebar">
        <div className="editor-title-copy">
          <span>{pageType || "WIKI PAGE"}</span>
          <h1>{title || "Untitled"}</h1>
        </div>
        <div className="editor-title-actions">
          {headerActions}
          <div
            className="editor-mode-switch"
            role="group"
            aria-label="편집 모드"
          >
            <button
              type="button"
              className={mode === "edit" ? "active" : ""}
              onClick={() => onModeChange("edit")}
            >
              <Pencil /> <span>편집</span>
            </button>
            <button
              type="button"
              aria-label="미리보기"
              className={mode === "preview" ? "active" : ""}
              onClick={() => onModeChange("preview")}
            >
              <Eye /> <span>읽기</span>
            </button>
          </div>
        </div>
      </header>
      {alerts}
      <div className={`editor-surface ${mode}`}>
        {mode === "edit" ? (
          <textarea
            className="markdown-editor"
            aria-label="Markdown 편집기"
            spellCheck={false}
            value={markdown}
            readOnly={!canWrite}
            onChange={(event) => onMarkdownChange(event.target.value)}
          />
        ) : (
          <MarkdownPreview value={markdown} onWikiLink={onWikiLink} />
        )}
      </div>
      <footer className="editor-statusbar">
        <div>
          <span>Markdown</span>
          <span>{markdown.length.toLocaleString()} chars</span>
          <span>v{version ?? "—"}</span>
        </div>
        <div>
          {mode === "edit" && canWrite && (
            <button
              type="button"
              className="status-action"
              aria-pressed={autosavePaused}
              onClick={onAutosaveToggle}
            >
              {autosavePaused ? <Play /> : <Pause />}
              {autosavePaused ? "자동 저장 재개" : "자동 저장 일시 중지"}
            </button>
          )}
          <button
            type="button"
            className="primary-action"
            disabled={!dirty || !canWrite}
            onClick={onSave}
          >
            <Save /> {dirty ? "변경 저장" : "저장됨"}
          </button>
        </div>
      </footer>
    </article>
  );
}
