"use client";

import type { ReactNode } from "react";
import { Eye, Pause, Pencil, Play, Save } from "lucide-react";

import { MarkdownPreview } from "@/app/markdown-preview";
import { useI18n } from "@/components/i18n-provider";

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
  const { t } = useI18n();
  return (
    <article className="wiki-editor">
      <header className="editor-titlebar">
        <div className="editor-title-copy">
          <span>{pageType || "WIKI PAGE"}</span>
          <h1>{title || t("common.untitled")}</h1>
        </div>
        <div className="editor-title-actions">
          {headerActions}
          <div
            className="editor-mode-switch"
            role="group"
            aria-label={t("editor.editMode")}
          >
            <button
              type="button"
              className={mode === "edit" ? "active" : ""}
              onClick={() => onModeChange("edit")}
            >
              <Pencil /> <span>{t("editor.edit")}</span>
            </button>
            <button
              type="button"
              aria-label={t("editor.preview")}
              className={mode === "preview" ? "active" : ""}
              onClick={() => onModeChange("preview")}
            >
              <Eye /> <span>{t("editor.read")}</span>
            </button>
          </div>
        </div>
      </header>
      {alerts}
      <div className={`editor-surface ${mode}`}>
        {mode === "edit" ? (
          <textarea
            className="markdown-editor"
            aria-label={t("editor.markdown")}
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
          <span>
            {markdown.length.toLocaleString()} {t("editor.chars")}
          </span>
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
              {autosavePaused
                ? t("editor.autosaveResume")
                : t("editor.autosavePause")}
            </button>
          )}
          <button
            type="button"
            className="primary-action"
            disabled={!dirty || !canWrite}
            onClick={onSave}
          >
            <Save />
            {dirty ? t("editor.saveChanges") : t("editor.saved")}
          </button>
        </div>
      </footer>
    </article>
  );
}
