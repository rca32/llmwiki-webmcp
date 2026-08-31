"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  Boxes,
  ChevronDown,
  ChevronRight,
  CircleDot,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderTree,
  Globe,
  Lightbulb,
  Plus,
  Trash2,
  Vault,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useI18n, type TranslationKey } from "@/components/i18n-provider";

export type KnowledgeTreePage = {
  id: string;
  parent_id: string | null;
  title: string;
  page_type: string;
  version: number;
  sort_order: number;
  path: string;
};
export type VaultSummary = { id: string; title: string; role: string };

const typeOrder = [
  "overview",
  "concept",
  "entity",
  "note",
  "source",
  "synthesis",
  "comparison",
  "query",
  "other",
];
function typeConfig(type: string, t: (key: TranslationKey) => string) {
  const configs: Record<
    string,
    { label: string; icon: typeof FileText; className: string }
  > = {
    overview: { label: t("type.overview"), icon: Globe, className: "type-overview" },
    concept: { label: t("type.concept"), icon: Lightbulb, className: "type-concept" },
    entity: { label: t("type.entity"), icon: CircleDot, className: "type-entity" },
    note: { label: t("type.note"), icon: FileText, className: "type-note" },
    source: { label: t("type.source"), icon: BookOpen, className: "type-source" },
    synthesis: { label: t("type.synthesis"), icon: Boxes, className: "type-synthesis" },
    comparison: { label: t("type.comparison"), icon: Boxes, className: "type-other" },
    query: { label: t("type.query"), icon: CircleDot, className: "type-other" },
    other: { label: t("type.other"), icon: FolderTree, className: "type-other" },
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
  vaults,
  activeVaultId,
  activeVaultTitle,
  activePageId,
  pendingPageId,
  currentFolderId,
  canWrite,
  canCreateVault,
  onOpenPage,
  onCreatePage,
  onMovePage,
  onSwitchVault,
  onCreateVault,
  onRestorePage,
}: {
  pages: KnowledgeTreePage[];
  deletedPages: KnowledgeTreePage[];
  vaults: VaultSummary[];
  activeVaultId: string | null;
  activeVaultTitle: string;
  activePageId: string | null;
  pendingPageId: string | null;
  currentFolderId: string | null;
  canWrite: boolean;
  canCreateVault: boolean;
  onOpenPage: (pageId: string) => void;
  onCreatePage: (parentId: string | null, kind: "page" | "folder") => void;
  onMovePage: (pageId: string, parentId: string | null) => void;
  onSwitchVault: (wikiId: string) => void;
  onCreateVault: () => void;
  onRestorePage: (page: KnowledgeTreePage) => void;
}) {
  const { language, t } = useI18n();
  const [treeMode, setTreeMode] = useState<"knowledge" | "files">("knowledge");
  const [expandedTypes, setExpandedTypes] = useState(() => new Set(typeOrder));
  const [expandedFolders, setExpandedFolders] = useState(
    () => new Set<string>(),
  );
  const [trashOpen, setTrashOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | "root" | null>(
    null,
  );

  const grouped = useMemo(() => {
    const result = new Map<string, KnowledgeTreePage[]>();
    for (const page of pages) {
      if (page.page_type === "folder") continue;
      const type = page.page_type || "other";
      result.set(type, [...(result.get(type) ?? []), page]);
    }
    return [...result.entries()]
      .map(
        ([type, items]) =>
          [
            type,
            items.sort((a, b) => a.title.localeCompare(b.title, language)),
          ] as const,
      )
      .sort(([a], [b]) => {
        const ai = typeOrder.indexOf(a),
          bi = typeOrder.indexOf(b);
        return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
      });
  }, [language, pages]);
  const childrenByParent = useMemo(() => {
    const result = new Map<string, KnowledgeTreePage[]>();
    const ids = new Set(pages.map((page) => page.id));
    for (const page of pages) {
      const key =
        page.parent_id && ids.has(page.parent_id) ? page.parent_id : "root";
      result.set(key, [...(result.get(key) ?? []), page]);
    }
    for (const siblings of result.values())
      siblings.sort(
        (a, b) =>
          Number(b.page_type === "folder") - Number(a.page_type === "folder") ||
          a.sort_order - b.sort_order ||
          a.title.localeCompare(b.title, language),
      );
    return result;
  }, [language, pages]);

  function toggleSet(
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    key: string,
  ) {
    setter((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function completeDrop(pageId: string, parentId: string | null) {
    setDraggedPageId(null);
    setDropTargetId(null);
    if (pageId !== parentId) onMovePage(pageId, parentId);
  }
  function handleTreeKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const rows = Array.from(
      event.currentTarget
        .closest(".tree-content")
        ?.querySelectorAll<HTMLButtonElement>(
          ".tree-page-row:not(.deleted), .tree-file-open",
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
  }
  function fileRows(parentKey: string, depth: number): React.ReactNode {
    return (childrenByParent.get(parentKey) ?? []).map((page) => {
      const children = childrenByParent.get(page.id) ?? [];
      const isFolder = page.page_type === "folder";
      const expanded = expandedFolders.has(page.id);
      const Icon = isFolder ? (expanded ? FolderOpen : Folder) : FileText;
      return (
        <div className="tree-file-node" key={page.id}>
          <div
            className={`tree-page-row file-row ${activePageId === page.id ? "active" : ""} ${pendingPageId === page.id ? "loading" : ""} ${dropTargetId === page.id ? "drop-target" : ""}`}
            style={{ paddingLeft: `${8 + depth * 15}px` }}
            draggable={canWrite}
            onDragStart={(event) => {
              setDraggedPageId(page.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", page.id);
            }}
            onDragEnd={() => {
              setDraggedPageId(null);
              setDropTargetId(null);
            }}
            onDragOver={(event) => {
              if (!isFolder || !draggedPageId || draggedPageId === page.id)
                return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setDropTargetId(page.id);
            }}
            onDrop={(event) => {
              if (!isFolder) return;
              event.preventDefault();
              const dragged =
                event.dataTransfer.getData("text/plain") || draggedPageId;
              if (dragged) {
                setExpandedFolders((current) => new Set(current).add(page.id));
                completeDrop(dragged, page.id);
              }
            }}
          >
            <button
              type="button"
              className="tree-folder-toggle"
              onClick={() => toggleSet(setExpandedFolders, page.id)}
              aria-label={`${page.title} ${expanded ? t("tree.collapse") : t("tree.expand")}`}
              disabled={!children.length}
            >
              {children.length ? (
                expanded ? (
                  <ChevronDown />
                ) : (
                  <ChevronRight />
                )
              ) : (
                <span />
              )}
            </button>
            <button
              type="button"
              className="tree-file-open"
              onClick={() => onOpenPage(page.id)}
              title={page.path}
              data-page-id={page.id}
              aria-busy={pendingPageId === page.id}
              onKeyDown={handleTreeKeyDown}
            >
              <Icon aria-hidden="true" />
              <span>{page.title}</span>
              <small>{isFolder ? children.length : `v${page.version}`}</small>
            </button>
          </div>
          {children.length > 0 && expanded && fileRows(page.id, depth + 1)}
        </div>
      );
    });
  }

  return (
    <section className="knowledge-tree-shell" aria-label={t("tree.explorer")}>
      <header className="vault-header">
        <Vault aria-hidden="true" />
        <label>
          <span>VAULT</span>
          <select
            value={activeVaultId ?? ""}
            onChange={(event) => onSwitchVault(event.target.value)}
            aria-label={t("tree.switchVault")}
          >
            {vaults.map((vault) => (
              <option key={vault.id} value={vault.id}>
                {vault.title}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="tree-action"
          onClick={onCreateVault}
          disabled={!canCreateVault}
          title={t("tree.newVault")}
          aria-label={t("tree.newVault")}
        >
          <Plus />
        </button>
      </header>
      <nav className="tree-tabs" aria-label={t("tree.sidebarView")}>
        <button
          type="button"
          className={treeMode === "knowledge" ? "active" : ""}
          onClick={() => setTreeMode("knowledge")}
        >
          {t("tree.knowledge")}
        </button>
        <button
          type="button"
          className={treeMode === "files" ? "active" : ""}
          onClick={() => setTreeMode("files")}
        >
          {t("tree.files")}
        </button>
      </nav>
      <header className="tree-header">
        <div>
          <strong>{activeVaultTitle}</strong>
          <span>
            {t("tree.pageCount", { count: pages.length })} ·{" "}
            {t("tree.folderCount", {
              count: pages.filter((page) => page.page_type === "folder").length,
            })}
          </span>
        </div>
        <div className="tree-create-wrap">
          <button
            type="button"
            className="tree-action"
            onClick={() => setCreateMenuOpen((open) => !open)}
            disabled={!canWrite}
            aria-label={t("tree.newItem")}
            title={t("tree.newPageOrFolder")}
            aria-expanded={createMenuOpen}
          >
            <Plus />
          </button>
          {createMenuOpen && (
            <div className="tree-create-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setCreateMenuOpen(false);
                  onCreatePage(currentFolderId, "page");
                }}
              >
                <FilePlus2 /> {t("tree.newPage")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setCreateMenuOpen(false);
                  onCreatePage(currentFolderId, "folder");
                }}
              >
                <FolderPlus /> {t("tree.newFolder")}
              </button>
            </div>
          )}
        </div>
      </header>
      <ScrollArea className="tree-scroll-area">
        <div className="tree-content">
          <p className="tree-label">
            {treeMode === "knowledge"
              ? t("tree.semanticGroups")
              : t("tree.physicalHierarchy")}
          </p>
          {pages.length === 0 && (
            <p className="tree-empty">{t("tree.empty")}</p>
          )}
          {treeMode === "files" && (
            <div className="tree-file-list">
              <div
                className={`tree-root-drop ${dropTargetId === "root" ? "drop-target" : ""}`}
                onDragOver={(event) => {
                  if (draggedPageId) {
                    event.preventDefault();
                    setDropTargetId("root");
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const dragged =
                    event.dataTransfer.getData("text/plain") || draggedPageId;
                  if (dragged) completeDrop(dragged, null);
                }}
              >
                <Vault />
                <span>{activeVaultTitle}</span>
                <small>root</small>
              </div>
              {fileRows("root", 0)}
            </div>
          )}
          {treeMode === "knowledge" &&
            grouped.map(([type, items]) => {
              const config = typeConfig(type, t),
                Icon = config.icon,
                expanded = expandedTypes.has(type);
              return (
                <div className="tree-group" key={type}>
                  <button
                    type="button"
                    className="tree-group-heading"
                    onClick={() => toggleSet(setExpandedTypes, type)}
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
                          className={`tree-page-row ${activePageId === page.id ? "active" : ""} ${pendingPageId === page.id ? "loading" : ""}`}
                          onClick={() => onOpenPage(page.id)}
                          title={`${page.path} · physical path`}
                          data-page-id={page.id}
                          aria-busy={pendingPageId === page.id}
                          onKeyDown={handleTreeKeyDown}
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
                <span>{t("tree.trash")}</span>
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
                      <small>{t("tree.restore")}</small>
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
        <span>{t("tree.footer")}</span>
      </footer>
    </section>
  );
}
