"use client";

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Bot,
  ChevronRight,
  Clock3,
  Copy,
  FileText,
  Languages,
  Link2,
  LogOut,
  Moon,
  Move,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  RotateCcw,
  Settings2,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import {
  buildCodexResearchPrompt,
  buildPagePermalink,
  readPagePermalink,
  type PagePermalinkTarget,
} from "@/lib/page-sharing";
import { SiteTools } from "./site-tools";
import {
  IconSidebar,
  type WorkspaceView,
} from "@/components/layout/icon-sidebar";
import { KnowledgeTree } from "@/components/layout/knowledge-tree";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  languageOptions,
  useI18n,
  type Language,
} from "@/components/i18n-provider";

const loadOperationsPanel = () => import("./operations-panel");
const loadWikiEditor = () => import("@/components/editor/wiki-editor");
const loadGraphView = () => import("@/components/graph/graph-view");
const loadSearchView = () => import("@/components/search/search-view");

const OperationsPanel = lazy(() =>
  loadOperationsPanel().then((module) => ({
    default: module.OperationsPanel,
  })),
);
const WikiEditor = lazy(() =>
  loadWikiEditor().then((module) => ({
    default: module.WikiEditor,
  })),
);
const GraphView = lazy(() =>
  loadGraphView().then((module) => ({
    default: module.GraphView,
  })),
);
const SearchView = lazy(() =>
  loadSearchView().then((module) => ({
    default: module.SearchView,
  })),
);

function WorkspaceLoading() {
  const { t } = useI18n();
  return (
    <div className="workspace-loading" role="status" aria-live="polite">
      {t("page.loading")}
    </div>
  );
}

type Page = {
  id: string;
  parent_id: string | null;
  title: string;
  page_type: string;
  markdown: string;
  version: number;
  sort_order: number;
  path: string;
  updated_at: string;
  deleted_at?: string | null;
};
type Revision = {
  version: number;
  change_summary: string | null;
  actor_email: string;
  origin: string;
  created_at: string;
};
type Neighbor = {
  source_page_id: string;
  target_page_id: string | null;
  target_text: string;
  source_title: string | null;
  target_title: string | null;
};
type Attachment = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  status: string;
  sha256: string;
};
type PageDetails = {
  page: Page;
  revisions: Revision[];
  neighbors: Neighbor[];
  attachments: Attachment[];
};
type Graph = {
  wiki_id: string;
  nodes: Array<{
    id: string;
    title: string;
    page_type: string;
    version: number;
  }>;
  edges: Array<{ source: string; target: string; target_text: string }>;
  truncated: boolean;
};
type EditConflict = {
  pageId: string;
  title: string;
  pageType: string;
  baseVersion: number;
  latest: Page;
  draft: string;
  diff: string;
};
type Caps = {
  can_bootstrap: boolean;
  can_create_wiki: boolean;
  can_read: boolean;
  can_write: boolean;
  can_restore: boolean;
  can_soft_delete: boolean;
  can_manage_attachments: boolean;
  can_export_portable: boolean;
  can_manage_members: boolean;
  can_full_backup: boolean;
  can_import: boolean;
};
const EMPTY_CAPABILITIES: Caps = {
  can_bootstrap: false,
  can_create_wiki: false,
  can_read: false,
  can_write: false,
  can_restore: false,
  can_soft_delete: false,
  can_manage_attachments: false,
  can_export_portable: false,
  can_manage_members: false,
  can_full_backup: false,
  can_import: false,
};
type WikiSummary = {
  id: string;
  title: string;
  role: string;
};
type SessionIdentity = {
  email: string;
  display_name: string;
};
type Envelope<T> =
  | { ok: true; data: T; change_set: unknown }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        details: Record<string, unknown>;
      };
    };

type SettledRequest<T> =
  | { data: T; error?: never }
  | { data?: never; error: unknown };

function settleRequest<T>(request: Promise<T>): Promise<SettledRequest<T>> {
  return request.then(
    (data) => ({ data }),
    (error: unknown) => ({ error }),
  );
}

function identityInitials(identity: SessionIdentity | null): string {
  const label = identity?.display_name.trim() || identity?.email.trim() || "";
  if (!label) return "LW";
  const words = label.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0][0]}${words.at(-1)?.[0]}` : label[0])
    .toLocaleUpperCase()
    .slice(0, 2);
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "same-origin" });
  const envelope = (await response.json()) as Envelope<T>;
  if (!response.ok || !envelope.ok)
    throw envelope.ok
      ? new Error(`Request failed (${response.status})`)
      : Object.assign(new Error(envelope.error.message), {
          code: envelope.error.code,
          details: envelope.error.details,
        });
  return envelope.data;
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall through for browsers that expose Clipboard but deny the call.
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("클립보드에 복사하지 못했습니다.");
}

function lineDiff(latest: string, draft: string) {
  const latestLines = latest.split("\n"),
    draftLines = draft.split("\n"),
    output: string[] = [],
    length = Math.max(latestLines.length, draftLines.length);
  for (let index = 0; index < length; index++) {
    const current = latestLines[index],
      mine = draftLines[index];
    if (current === mine) output.push(`  ${current ?? ""}`);
    else {
      if (current !== undefined) output.push(`- ${current}`);
      if (mine !== undefined) output.push(`+ ${mine}`);
    }
    if (output.length >= 500) {
      output.push("… diff가 500줄에서 생략되었습니다.");
      break;
    }
  }
  return output.join("\n").slice(0, 30_000);
}

function mergeDraft(latest: string, draft: string) {
  return [
    "<<<<<<< 최신 버전",
    latest,
    "=======",
    draft,
    ">>>>>>> 내 초안",
  ].join("\n");
}

function WorkspaceDialog({
  title,
  description,
  children,
  confirmLabel,
  confirmDisabled,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  confirmLabel: string;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className="workspace-dialog-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="workspace-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span>WORKSPACE</span>
            <h2 id="workspace-dialog-title">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            ×
          </button>
        </header>
        <p>{description}</p>
        {children}
        <footer>
          <button type="button" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="primary"
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}

export default function Home() {
  const { language, setLanguage, t } = useI18n();
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [view, setView] = useState<WorkspaceView>("document");
  const [mobileWorkspacePane, setMobileWorkspacePane] = useState<
    "navigation" | "content" | "details"
  >("content");
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [pages, setPages] = useState<Page[]>([]);
  const [deletedPages, setDeletedPages] = useState<Page[]>([]);
  const [active, setActive] = useState<Page | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [savedMarkdown, setSavedMarkdown] = useState("");
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [neighbors, setNeighbors] = useState<Neighbor[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [pendingPageId, setPendingPageId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchIds, setSearchIds] = useState<Set<string> | null>(null);
  const [status, setStatus] = useState("연결 중…");
  const [caps, setCaps] = useState<Caps>(EMPTY_CAPABILITIES);
  const [identity, setIdentity] = useState<SessionIdentity | null>(null);
  const [currentWiki, setCurrentWiki] = useState<WikiSummary | null>(null);
  const [wikis, setWikis] = useState<WikiSummary[]>([]);
  const [createTarget, setCreateTarget] = useState<{
    parentId: string | null;
    kind: "page" | "folder";
  } | null>(null);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveParentId, setMoveParentId] = useState<string | null>(null);
  const [vaultDialogOpen, setVaultDialogOpen] = useState(false);
  const [newVaultTitle, setNewVaultTitle] = useState("");
  const [newVaultTemplate, setNewVaultTemplate] = useState<"empty" | "starter">(
    "empty",
  );
  const [siteVersion, setSiteVersion] = useState(1);
  const [writeMode, setWriteMode] = useState<"read_write" | "read_only">(
    "read_write",
  );
  const [writeModeReason, setWriteModeReason] = useState<string | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editConflict, setEditConflict] = useState<EditConflict | null>(null);
  const [autosavePaused, setAutosavePaused] = useState(false);
  const viewRef = useRef(view);
  const activeRef = useRef<Page | null>(null);
  const pagesRef = useRef<Page[]>([]);
  const pageDetailsCacheRef = useRef(new Map<string, PageDetails>());
  const desiredPageIdRef = useRef<string | null>(null);
  const openPageRequestRef = useRef(0);
  const workspaceRequestRef = useRef(0);
  const graphRequestRef = useRef(0);
  const currentWikiIdRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const markdownRef = useRef("");
  const autosavePausedRef = useRef(false);
  const initialPermalinkRef = useRef<PagePermalinkTarget | null>(null);
  const permalinkReadRef = useRef(false);
  const dirty = markdown !== savedMarkdown;
  const changeView = useCallback((nextView: WorkspaceView) => {
    // Keep asynchronous workspace hydration from restoring the document view
    // after the user has already navigated elsewhere in the same event turn.
    viewRef.current = nextView;
    setView(nextView);
  }, []);
  useEffect(() => {
    const storedTheme = window.localStorage.getItem("liminal-wiki:theme-v2");
    // Keep dark mode available, but use light as the deterministic default
    // across devices.
    const shouldUseDark = storedTheme === "dark";
    document.documentElement.classList.toggle("dark", shouldUseDark);
    window.queueMicrotask(() => setDarkMode(shouldUseDark));
  }, []);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);
  useEffect(() => {
    const preloadSecondaryViews = () => {
      void Promise.all([
        loadOperationsPanel(),
        loadGraphView(),
        loadSearchView(),
      ]);
    };
    const idle = window.requestIdleCallback(preloadSecondaryViews, {
      timeout: 2_000,
    });
    return () => window.cancelIdleCallback(idle);
  }, []);
  useEffect(() => {
    dirtyRef.current = dirty;
    activeRef.current = active;
    markdownRef.current = markdown;
    autosavePausedRef.current = autosavePaused;
  }, [dirty, active, markdown, autosavePaused]);
  const updateAutosavePaused = useCallback((paused: boolean) => {
    autosavePausedRef.current = paused;
    setAutosavePaused(paused);
  }, []);
  const replacePageSnapshot = useCallback((nextPage: Page) => {
    setPages((current) => {
      const next = current.map((page) =>
        page.id === nextPage.id ? nextPage : page,
      );
      pagesRef.current = next;
      return next;
    });
  }, []);

  const openPage = useCallback(
    async (pageId: string, preserveDraft = false) => {
      if (
        preserveDraft &&
        desiredPageIdRef.current &&
        desiredPageIdRef.current !== pageId
      )
        return;
      if (!preserveDraft) desiredPageIdRef.current = pageId;
      const requestNumber = ++openPageRequestRef.current;
      const protectedDraft = dirtyRef.current || autosavePausedRef.current;
      const protectsCurrentDraft =
        protectedDraft && (preserveDraft || activeRef.current?.id === pageId);
      const snapshot = pagesRef.current.find((page) => page.id === pageId);
      const cached = pageDetailsCacheRef.current.get(pageId);
      const validCache =
        cached && (!snapshot || cached.page.version === snapshot.version)
          ? cached
          : null;

      if (!preserveDraft) {
        changeView("document");
        setMobileWorkspacePane("content");
      }
      if (!protectsCurrentDraft) {
        setPendingPageId(pageId);
        const immediatePage = validCache?.page ?? snapshot;
        if (immediatePage) {
          desiredPageIdRef.current = immediatePage.id;
          activeRef.current = immediatePage;
          setActive(immediatePage);
          setMarkdown(immediatePage.markdown);
          setSavedMarkdown(immediatePage.markdown);
          setRevisions(validCache?.revisions ?? []);
          setNeighbors(validCache?.neighbors ?? []);
          setAttachments(validCache?.attachments ?? []);
          setStatus(validCache ? "최신 정보 확인 중…" : "세부 정보 동기화 중…");
          setNotice(null);
          setEditConflict(null);
          updateAutosavePaused(false);
        }
      }

      try {
        const [
          { page },
          { revisions: history },
          { neighbors: linked },
          { attachments: files },
        ] = await Promise.all([
          api<{ page: Page }>(`/api/pages/${pageId}`),
          api<{ revisions: Revision[] }>(
            `/api/pages/${pageId}/revisions?limit=10`,
          ),
          api<{ neighbors: Neighbor[] }>(
            `/api/pages/${pageId}/neighbors?limit=20`,
          ),
          api<{ attachments: Attachment[] }>(
            `/api/attachments?page_id=${encodeURIComponent(pageId)}&include_deleted=true`,
          ),
        ]);
        if (
          requestNumber !== openPageRequestRef.current ||
          (desiredPageIdRef.current && desiredPageIdRef.current !== pageId)
        )
          return;
        const details = {
          page,
          revisions: history,
          neighbors: linked,
          attachments: files,
        };
        pageDetailsCacheRef.current.set(pageId, details);
        const protectedDuringRequest =
          (dirtyRef.current || autosavePausedRef.current) &&
          activeRef.current?.id === pageId;
        if (protectsCurrentDraft || protectedDuringRequest) {
          setRevisions(history);
          setNeighbors(linked);
          setAttachments(files);
          return;
        }
        desiredPageIdRef.current = page.id;
        activeRef.current = page;
        setActive(page);
        replacePageSnapshot(page);
        setMarkdown(page.markdown);
        setSavedMarkdown(page.markdown);
        setRevisions(history);
        setNeighbors(linked);
        setAttachments(files);
        setStatus("동기화됨");
        setNotice(null);
        setEditConflict(null);
        updateAutosavePaused(false);
      } catch (error) {
        if (requestNumber !== openPageRequestRef.current) return;
        setStatus(
          snapshot || validCache ? "본문 표시됨 · 동기화 지연" : "연결 실패",
        );
        setNotice(
          error instanceof Error
            ? error.message
            : "페이지의 최신 정보를 불러오지 못했습니다.",
        );
      } finally {
        if (requestNumber === openPageRequestRef.current)
          setPendingPageId(null);
      }
    },
    [changeView, replacePageSnapshot, updateAutosavePaused],
  );

  const openBreadcrumbPage = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const pageId = event.currentTarget.dataset.pageId;
      if (pageId) void openPage(pageId);
    },
    [openPage],
  );

  const captureEditConflict = useCallback(
    async (pageId: string, draft: string, baseVersion: number) => {
      const { page } = await api<{ page: Page }>(`/api/pages/${pageId}`);
      if (activeRef.current?.id !== pageId) return;
      setEditConflict({
        pageId,
        title: page.title,
        pageType: page.page_type,
        baseVersion,
        latest: page,
        draft,
        diff: lineDiff(page.markdown, draft),
      });
      updateAutosavePaused(true);
      setStatus("병합 필요");
      setNotice(null);
    },
    [updateAutosavePaused],
  );

  const loadWorkspace = useCallback(
    async (refreshActive = true) => {
      const requestNumber = ++workspaceRequestRef.current;
      try {
        if (!permalinkReadRef.current) {
          initialPermalinkRef.current = readPagePermalink(window.location.href);
          permalinkReadRef.current = true;
        }
        const requestedTarget = initialPermalinkRef.current;
        let activePagesPromise = settleRequest(
          api<{ pages: Page[] }>(
            "/api/pages?depth=64&limit=200&include_markdown=true",
          ),
        );
        let session = await api<{
          identity: SessionIdentity;
          wiki: {
            id: string;
            title: string;
            role: string;
          } | null;
          capabilities: Caps;
          site_version: number;
          write_mode: "read_write" | "read_only";
          write_mode_reason: string | null;
        }>("/api/session/capabilities");
        setAuthRequired(false);
        if (
          requestedTarget &&
          session.capabilities.can_read &&
          requestedTarget.wikiId !== session.wiki?.id
        ) {
          try {
            await api("/api/session/active-wiki", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ wiki_id: requestedTarget.wikiId }),
            });
            activePagesPromise = settleRequest(
              api<{ pages: Page[] }>(
                "/api/pages?depth=64&limit=200&include_markdown=true",
              ),
            );
            session = await api<{
              identity: SessionIdentity;
              wiki: {
                id: string;
                title: string;
                role: string;
              } | null;
              capabilities: Caps;
              site_version: number;
              write_mode: "read_write" | "read_only";
              write_mode_reason: string | null;
            }>("/api/session/capabilities");
          } catch {
            setNotice("공유 링크의 Vault를 열 권한이 없거나 찾을 수 없습니다.");
          }
        }
        if (requestNumber !== workspaceRequestRef.current) return;
        if (currentWikiIdRef.current !== session.wiki?.id) {
          currentWikiIdRef.current = session.wiki?.id ?? null;
          graphRequestRef.current++;
          setGraph(null);
          openPageRequestRef.current++;
          desiredPageIdRef.current = null;
          activeRef.current = null;
          setActive(null);
          setMarkdown("");
          setSavedMarkdown("");
          pageDetailsCacheRef.current.clear();
        }
        setCurrentWiki(session.wiki);
        setIdentity(session.identity);
        setCaps(session.capabilities);
        setSiteVersion(session.site_version);
        setWriteMode(session.write_mode);
        setWriteModeReason(session.write_mode_reason);
        setSessionLoaded(true);
        if (!session.capabilities.can_read) {
          setWikis([]);
          setPages([]);
          setDeletedPages([]);
          setStatus(
            session.capabilities.can_bootstrap
              ? "초기 설정 필요"
              : "읽기 권한 없음",
          );
          return;
        }
        const accessible = await api<{ wikis: WikiSummary[] }>("/api/wikis");
        if (requestNumber !== workspaceRequestRef.current) return;
        setWikis(accessible.wikis);
        const activePagesRequest = await activePagesPromise;
        if ("error" in activePagesRequest) throw activePagesRequest.error;
        const list = activePagesRequest.data.pages;
        if (requestNumber !== workspaceRequestRef.current) return;
        pagesRef.current = list;
        for (const [pageId, cached] of pageDetailsCacheRef.current) {
          const listed = list.find((page) => page.id === pageId);
          if (!listed || listed.version !== cached.page.version)
            pageDetailsCacheRef.current.delete(pageId);
        }
        setPages(list);
        if (session.capabilities.can_soft_delete) {
          window.setTimeout(() => {
            void api<{ pages: Page[] }>(
              "/api/pages?deleted=only&limit=100&include_markdown=true",
            ).then(
              ({ pages: deleted }) => {
                if (requestNumber === workspaceRequestRef.current)
                  setDeletedPages(deleted);
              },
              (error: unknown) => {
                if (requestNumber !== workspaceRequestRef.current) return;
                setNotice(
                  error instanceof Error
                    ? error.message
                    : "휴지통 목록을 불러오지 못했습니다.",
                );
              },
            );
          }, 250);
        }
        if (requestNumber !== workspaceRequestRef.current) return;
        const current = activeRef.current;
        if (
          refreshActive &&
          viewRef.current === "document" &&
          !dirtyRef.current &&
          !autosavePausedRef.current
        ) {
          const requestedPageId =
            requestedTarget && requestedTarget.wikiId === session.wiki?.id
              ? requestedTarget.pageId
              : null;
          const target =
            requestedPageId && list.some((page) => page.id === requestedPageId)
              ? requestedPageId
              : current && list.some((page) => page.id === current.id)
                ? current.id
                : list[0]?.id;
          if (requestedPageId && target !== requestedPageId)
            setNotice(
              "공유 링크의 페이지를 찾을 수 없어 첫 페이지를 열었습니다.",
            );
          initialPermalinkRef.current = null;
          if (target) void openPage(target, true);
        } else setStatus("목록 갱신됨");
      } catch (error) {
        if (requestNumber !== workspaceRequestRef.current) return;
        setSessionLoaded(true);
        const code =
          error instanceof Error && "code" in error ? String(error.code) : null;
        if (code === "unauthenticated") {
          currentWikiIdRef.current = null;
          activeRef.current = null;
          pagesRef.current = [];
          pageDetailsCacheRef.current.clear();
          setAuthRequired(true);
          setIdentity(null);
          setCaps(EMPTY_CAPABILITIES);
          setCurrentWiki(null);
          setWikis([]);
          setPages([]);
          setDeletedPages([]);
          setActive(null);
          setMarkdown("");
          setSavedMarkdown("");
          setRevisions([]);
          setNeighbors([]);
          setAttachments([]);
          setGraph(null);
          setStatus("로그인 필요");
          setNotice(null);
        } else {
          setStatus("연결 실패");
          setNotice(
            error instanceof Error
              ? error.message
              : "위키를 불러오지 못했습니다.",
          );
        }
      }
    },
    [openPage],
  );

  useEffect(() => {
    if (authRequired) return;
    const initial = window.setTimeout(() => void loadWorkspace(), 0);
    const onChange = () => void loadWorkspace(true);
    const onFocus = () => void loadWorkspace(true);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadWorkspace(true);
    }, 15_000);
    window.addEventListener("wiki:changed", onChange);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(poll);
      window.removeEventListener("wiki:changed", onChange);
      window.removeEventListener("focus", onFocus);
    };
  }, [authRequired, loadWorkspace]);
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "k") {
        event.preventDefault();
        changeView("search");
        window.requestAnimationFrame(() =>
          document
            .querySelector<HTMLInputElement>(".search-view-input input")
            ?.focus(),
        );
      } else if (
        key === "e" &&
        event.shiftKey &&
        caps.can_write &&
        view === "document"
      ) {
        event.preventDefault();
        setMode("edit");
        window.requestAnimationFrame(() =>
          document
            .querySelector<HTMLTextAreaElement>(".markdown-editor")
            ?.focus(),
        );
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [caps.can_write, changeView, view]);
  useEffect(() => {
    if (
      !active ||
      !caps.can_write ||
      markdown === savedMarkdown ||
      editConflict ||
      autosavePaused
    )
      return;
    const pageId = active.id,
      expectedVersion = active.version,
      draft = markdown,
      timer = window.setTimeout(() => {
        setStatus("자동 저장 중…");
        void api<{ page_id: string; version: number }>(`/api/pages/${pageId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            expected_version: expectedVersion,
            markdown: draft,
            change_summary: "자동 저장",
            save_kind: "autosave",
            operation_id: crypto.randomUUID(),
          }),
        })
          .then(async (result) => {
            if (activeRef.current?.id !== pageId) return;
            const updatedPage = {
              ...activeRef.current,
              version: result.version,
              markdown: draft,
            };
            activeRef.current = updatedPage;
            setActive(updatedPage);
            replacePageSnapshot(updatedPage);
            pageDetailsCacheRef.current.delete(pageId);
            setSavedMarkdown(draft);
            setStatus(
              markdownRef.current === draft ? "자동 저장됨" : "추가 변경 있음",
            );
            setRevisions(
              (
                await api<{ revisions: Revision[] }>(
                  `/api/pages/${pageId}/revisions?limit=10`,
                )
              ).revisions,
            );
          })
          .catch((error: unknown) => {
            setStatus("자동 저장 중단");
            if (
              error instanceof Error &&
              (error as Error & { code?: string }).code === "version_conflict"
            )
              void captureEditConflict(pageId, draft, expectedVersion).catch(
                () =>
                  setNotice(
                    "최신 버전을 불러오지 못했습니다. 초안은 이 탭에 유지됩니다.",
                  ),
              );
            else
              setNotice(
                error instanceof Error
                  ? error.message
                  : "자동 저장하지 못했습니다.",
              );
          });
      }, 3000);
    return () => window.clearTimeout(timer);
  }, [
    active,
    autosavePaused,
    caps.can_write,
    captureEditConflict,
    editConflict,
    markdown,
    replacePageSnapshot,
    savedMarkdown,
  ]);
  useEffect(() => {
    if (active) {
      document.documentElement.dataset.pageId = active.id;
      if (currentWiki)
        window.history.replaceState(
          null,
          "",
          buildPagePermalink(window.location.href, currentWiki.id, active.id),
        );
    } else delete document.documentElement.dataset.pageId;
  }, [active, currentWiki]);
  useEffect(() => {
    if (currentWiki) document.documentElement.dataset.wikiId = currentWiki.id;
    else delete document.documentElement.dataset.wikiId;
  }, [currentWiki]);
  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) return;
    let activeRequest = true;
    const timer = window.setTimeout(() => {
      void api<{ results: Array<{ page_id: string }> }>("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: normalized, limit: 20 }),
      })
        .then(({ results }) => {
          if (activeRequest)
            setSearchIds(new Set(results.map((result) => result.page_id)));
        })
        .catch((error: unknown) => {
          if (activeRequest)
            setNotice(
              error instanceof Error ? error.message : "검색하지 못했습니다.",
            );
        });
    }, 250);
    return () => {
      activeRequest = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  const filtered = useMemo(
    () =>
      query.trim() && searchIds
        ? pages.filter((page) => searchIds.has(page.id))
        : pages,
    [pages, query, searchIds],
  );

  async function save() {
    if (!active || !dirty || !caps.can_write) return;
    setStatus("저장 중…");
    setNotice(null);
    try {
      let expectedVersion = active.version;
      if (process.env.NODE_ENV !== "production") {
        const forcedVersion = Number(
          window.sessionStorage.getItem("liminal:test:expected-version"),
        );
        window.sessionStorage.removeItem("liminal:test:expected-version");
        if (Number.isInteger(forcedVersion) && forcedVersion > 0)
          expectedVersion = forcedVersion;
      }
      const result = await api<{ page_id: string; version: number }>(
        `/api/pages/${active.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            expected_version: expectedVersion,
            markdown,
            change_summary: "UI에서 문서 편집",
            operation_id: crypto.randomUUID(),
          }),
        },
      );
      const updatedPage = { ...active, markdown, version: result.version };
      activeRef.current = updatedPage;
      setActive(updatedPage);
      replacePageSnapshot(updatedPage);
      pageDetailsCacheRef.current.delete(active.id);
      setSavedMarkdown(markdown);
      updateAutosavePaused(false);
      setStatus("방금 저장됨");
      setRevisions(
        (
          await api<{ revisions: Revision[] }>(
            `/api/pages/${active.id}/revisions?limit=10`,
          )
        ).revisions,
      );
    } catch (error) {
      setStatus("저장 중단");
      if (
        error instanceof Error &&
        (error as Error & { code?: string }).code === "version_conflict"
      )
        await captureEditConflict(active.id, markdown, active.version).catch(
          () =>
            setNotice(
              "최신 버전을 불러오지 못했습니다. 초안은 이 탭에 유지됩니다.",
            ),
        );
      else
        setNotice(
          error instanceof Error ? error.message : "저장하지 못했습니다.",
        );
    }
  }

  function beginConflictMerge() {
    if (!editConflict) return;
    activeRef.current = editConflict.latest;
    setActive(editConflict.latest);
    replacePageSnapshot(editConflict.latest);
    pageDetailsCacheRef.current.delete(editConflict.latest.id);
    setSavedMarkdown(editConflict.latest.markdown);
    setMarkdown(mergeDraft(editConflict.latest.markdown, editConflict.draft));
    setEditConflict(null);
    updateAutosavePaused(true);
    setStatus("병합 초안 검토 중");
  }

  async function saveConflictAsNewPage() {
    if (!editConflict || !caps.can_write) return;
    try {
      const created = await api<{ page_id: string }>("/api/pages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: `${editConflict.title} (충돌 초안 ${new Date().toLocaleString("ko-KR")})`,
          page_type: editConflict.pageType,
          markdown: editConflict.draft,
          parent_id: null,
          operation_id: crypto.randomUUID(),
        }),
      });
      setEditConflict(null);
      updateAutosavePaused(false);
      await loadWorkspace(false);
      await openPage(created.page_id);
      setNotice("내 초안을 새 페이지로 보존했습니다.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "충돌 초안을 새 페이지로 저장하지 못했습니다.",
      );
    }
  }

  function startCreateItem(parentId: string | null, kind: "page" | "folder") {
    if (!caps.can_write) return;
    setNewItemTitle("");
    setCreateTarget({ parentId, kind });
  }

  async function createNewPage() {
    if (!caps.can_write || !createTarget || !newItemTitle.trim()) return;
    const title = newItemTitle.trim();
    const kind = createTarget.kind;
    try {
      const created = await api<{ page_id: string }>("/api/pages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          page_type: kind === "folder" ? "folder" : "note",
          markdown:
            kind === "folder"
              ? `# ${title}\n\n이 폴더의 인덱스 페이지입니다. 하위 페이지의 맥락과 탐색 기준을 기록하세요.\n`
              : `# ${title}\n\n`,
          parent_id: createTarget.parentId,
          operation_id: crypto.randomUUID(),
        }),
      });
      setCreateTarget(null);
      setNewItemTitle("");
      await loadWorkspace(false);
      await openPage(created.page_id);
      setStatus(
        kind === "folder" ? "폴더를 만들었습니다." : "페이지를 만들었습니다.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "페이지를 만들지 못했습니다.",
      );
    }
  }

  async function restoreRevision(version: number) {
    if (!active || !caps.can_restore || dirty) return;
    if (
      !window.confirm(
        `v${version} 스냅샷을 새 리비전으로 복구할까요? 현재 기록은 보존됩니다.`,
      )
    )
      return;
    try {
      await api(`/api/pages/${active.id}/restore`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expected_version: active.version,
          restore_version: version,
          operation_id: crypto.randomUUID(),
        }),
      });
      await openPage(active.id);
      setStatus(`v${version}에서 복구됨`);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "리비전을 복구하지 못했습니다.",
      );
    }
  }

  async function movePageTo(pageId: string, parentId: string | null) {
    const page = pagesRef.current.find((candidate) => candidate.id === pageId);
    if (!page || !caps.can_write) return;
    if (page.parent_id === parentId) {
      setMoveDialogOpen(false);
      setStatus("이미 선택한 위치에 있습니다.");
      return;
    }
    if (activeRef.current?.id === pageId && dirtyRef.current) {
      setNotice("저장되지 않은 변경을 먼저 저장한 뒤 이동하세요.");
      return;
    }
    setStatus("페이지 이동 중…");
    try {
      await api(`/api/pages/${page.id}/move`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expected_version: page.version,
          parent_id: parentId,
          sort_order: 0,
          operation_id: crypto.randomUUID(),
        }),
      });
      setMoveDialogOpen(false);
      pageDetailsCacheRef.current.delete(page.id);
      await loadWorkspace(false);
      if (activeRef.current?.id === page.id) await openPage(page.id, true);
      setStatus("페이지를 이동했습니다.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "페이지를 이동하지 못했습니다.",
      );
    }
  }

  async function switchVault(wikiId: string) {
    if (!wikiId || wikiId === currentWiki?.id) return;
    if (
      dirty &&
      !window.confirm("저장되지 않은 변경이 있습니다. Vault를 전환할까요?")
    )
      return;
    try {
      setStatus("Vault 전환 중…");
      graphRequestRef.current++;
      openPageRequestRef.current++;
      desiredPageIdRef.current = null;
      activeRef.current = null;
      setActive(null);
      setMarkdown("");
      setSavedMarkdown("");
      setDeletedPages([]);
      setGraph(null);
      pageDetailsCacheRef.current.clear();
      await api("/api/session/active-wiki", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wiki_id: wikiId }),
      });
      await loadWorkspace(true);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Vault를 전환하지 못했습니다.",
      );
      await loadWorkspace(true);
    }
  }

  async function createVault() {
    if (!caps.can_create_wiki || !newVaultTitle.trim()) return;
    if (
      dirty &&
      !window.confirm("저장되지 않은 변경이 있습니다. 새 Vault를 만들까요?")
    )
      return;
    try {
      setStatus("Vault 만드는 중…");
      graphRequestRef.current++;
      openPageRequestRef.current++;
      desiredPageIdRef.current = null;
      activeRef.current = null;
      setActive(null);
      setMarkdown("");
      setSavedMarkdown("");
      setPages([]);
      setDeletedPages([]);
      setGraph(null);
      pageDetailsCacheRef.current.clear();
      await api("/api/wikis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: newVaultTitle.trim(),
          template: newVaultTemplate,
          operation_id: crypto.randomUUID(),
        }),
      });
      setVaultDialogOpen(false);
      setNewVaultTitle("");
      setNewVaultTemplate("empty");
      await loadWorkspace(true);
      setStatus("새 Vault를 만들었습니다.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Vault를 만들지 못했습니다.",
      );
      await loadWorkspace(true);
    }
  }

  async function deleteActivePage() {
    if (!active || !caps.can_soft_delete || dirty) return;
    const confirmation = window.prompt(
      `leaf 페이지만 삭제할 수 있습니다. 계속하려면 DELETE ${active.title} 을 입력하세요.`,
    );
    if (confirmation === null) return;
    const reason = window.prompt("삭제 이유를 입력하세요.", "사용자 요청");
    if (!reason?.trim()) return;
    try {
      await api(`/api/pages/${active.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expected_version: active.version,
          confirmation,
          reason: reason.trim(),
          operation_id: crypto.randomUUID(),
        }),
      });
      activeRef.current = null;
      setActive(null);
      setMarkdown("");
      setSavedMarkdown("");
      await loadWorkspace(true);
      setStatus("페이지를 소프트 삭제했습니다.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "페이지를 삭제하지 못했습니다.",
      );
    }
  }

  async function restoreDeleted(page: Page) {
    if (!caps.can_soft_delete) return;
    try {
      const result = await api<{ page_id: string }>(
        `/api/pages/${page.id}/restore-deleted`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            expected_version: page.version,
            replacement_slug: null,
            operation_id: crypto.randomUUID(),
          }),
        },
      );
      await loadWorkspace(false);
      await openPage(result.page_id);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "삭제된 페이지를 복구하지 못했습니다.",
      );
    }
  }

  async function showGraph() {
    changeView("graph");
    setGraph(null);
    setGraphLoading(true);
    const expectedWikiId = currentWiki?.id ?? null,
      requestNumber = ++graphRequestRef.current;
    try {
      const nextGraph = await api<Graph>("/api/graph?limit=2000");
      if (
        requestNumber === graphRequestRef.current &&
        nextGraph.wiki_id === expectedWikiId
      )
        setGraph(nextGraph);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "그래프를 불러오지 못했습니다.",
      );
    } finally {
      setGraphLoading(false);
    }
  }

  function openWikiLink(title: string) {
    const target = pages.find(
      (page) => page.title.toLowerCase() === title.trim().toLowerCase(),
    );
    if (target) void openPage(target.id);
    else setNotice(`“${title}” 페이지를 찾지 못했습니다.`);
  }

  function activePermalink() {
    if (!active || !currentWiki) return null;
    return buildPagePermalink(window.location.href, currentWiki.id, active.id);
  }

  async function copyActiveLink() {
    const link = activePermalink();
    if (!link) return;
    try {
      await copyText(link);
      setNotice("이 페이지를 바로 여는 링크를 복사했습니다.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "링크를 복사하지 못했습니다.",
      );
    }
  }

  async function copyActiveMarkdown() {
    if (!active) return;
    try {
      await copyText(markdown);
      setNotice(
        dirty
          ? "편집 중인 Markdown을 복사했습니다."
          : "페이지 Markdown을 복사했습니다.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "본문을 복사하지 못했습니다.",
      );
    }
  }

  async function copyCodexRequest() {
    const link = activePermalink();
    if (!active || !link) return;
    try {
      await copyText(buildCodexResearchPrompt(active.title, link));
      setNotice("Codex에 붙여넣을 추가 조사 요청을 복사했습니다.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Codex 요청을 복사하지 못했습니다.",
      );
    }
  }

  async function uploadFile(file: File) {
    if (!active || !caps.can_manage_attachments) return;
    const form = new FormData();
    form.set("file", file);
    form.set("page_id", active.id);
    form.set("operation_id", crypto.randomUUID());
    try {
      setStatus("첨부 업로드 중…");
      await api("/api/attachments", { method: "POST", body: form });
      setAttachments(
        (
          await api<{ attachments: Attachment[] }>(
            `/api/attachments?page_id=${active.id}&include_deleted=true`,
          )
        ).attachments,
      );
      setStatus("첨부 업로드됨");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "첨부파일을 올리지 못했습니다.",
      );
    }
  }

  async function deleteAttachment(attachment: Attachment) {
    if (
      !active ||
      !caps.can_manage_attachments ||
      !window.confirm(`${attachment.filename} 첨부를 소프트 삭제할까요?`)
    )
      return;
    try {
      await api(`/api/attachments/${attachment.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation_id: crypto.randomUUID() }),
      });
      setAttachments(
        (
          await api<{ attachments: Attachment[] }>(
            `/api/attachments?page_id=${active.id}&include_deleted=true`,
          )
        ).attachments,
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "첨부파일을 삭제하지 못했습니다.",
      );
    }
  }

  async function restoreAttachment(attachment: Attachment) {
    if (!active || !caps.can_manage_attachments) return;
    try {
      await api(`/api/attachments/${attachment.id}/restore`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation_id: crypto.randomUUID() }),
      });
      setAttachments(
        (
          await api<{ attachments: Attachment[] }>(
            `/api/attachments?page_id=${active.id}&include_deleted=true`,
          )
        ).attachments,
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "첨부파일을 복구하지 못했습니다.",
      );
    }
  }

  const linkedPages = useMemo(
    () =>
      neighbors
        .map((item) =>
          item.source_page_id === active?.id
            ? {
                id: item.target_page_id,
                title: item.target_title ?? item.target_text,
                direction: "out",
              }
            : {
                id: item.source_page_id,
                title: item.source_title ?? "연결된 페이지",
                direction: "in",
              },
        )
        .filter(
          (item, index, items) =>
            item.id &&
            items.findIndex((candidate) => candidate.id === item.id) === index,
        ),
    [neighbors, active],
  );

  const currentFolderId =
    active?.page_type === "folder" ? active.id : (active?.parent_id ?? null);
  const breadcrumbPages = useMemo(() => {
    if (!active) return [];
    const byId = new Map(pages.map((page) => [page.id, page]));
    const trail: Page[] = [active];
    let parentId = active.parent_id;
    for (let depth = 0; parentId && depth < 64; depth++) {
      const parent = byId.get(parentId);
      if (!parent) break;
      trail.unshift(parent);
      parentId = parent.parent_id;
    }
    return trail;
  }, [active, pages]);
  const invalidMoveFolderIds = useMemo(() => {
    const invalid = new Set<string>();
    if (!active) return invalid;
    invalid.add(active.id);
    let changed = true;
    while (changed) {
      changed = false;
      for (const page of pages)
        if (
          page.parent_id &&
          invalid.has(page.parent_id) &&
          !invalid.has(page.id)
        ) {
          invalid.add(page.id);
          changed = true;
        }
    }
    return invalid;
  }, [active, pages]);

  if (sessionLoaded && authRequired)
    return (
      <main className="wiki-shell bootstrap-shell-root">
        <section className="bootstrap-stage">
          <div className="bootstrap-card auth-card">
            <p className="eyebrow">{t("auth.eyebrow")}</p>
            <h1>{t("auth.title")}</h1>
            <p>{t("auth.description")}</p>
            <div className="bootstrap-actions">
              <a
                className="save-button"
                href="/signin-with-chatgpt?return_to=%2F"
                target="_top"
              >
                {t("auth.action")}
              </a>
            </div>
          </div>
        </section>
      </main>
    );

  if (sessionLoaded && !caps.can_read)
    return (
      <main className="wiki-shell bootstrap-shell-root">
        <SiteTools
          key={`${writeMode}-${caps.can_write}-${caps.can_create_wiki}`}
        />
        <Suspense fallback={<WorkspaceLoading />}>
          <OperationsPanel
            capabilities={caps}
            siteVersion={siteVersion}
            hasWiki={false}
            writeMode={writeMode}
            writeModeReason={writeModeReason}
            onWorkspaceChanged={() => loadWorkspace(true)}
          />
        </Suspense>
      </main>
    );

  return (
    <main className="wiki-app">
      <SiteTools
        key={`${writeMode}-${caps.can_write}-${caps.can_create_wiki}`}
      />
      <IconSidebar
        activeView={view}
        leftPanelOpen={leftPanelOpen}
        onToggleLeftPanel={() => setLeftPanelOpen((value) => !value)}
        onViewChange={(nextView) => {
          setMobileWorkspacePane("content");
          if (nextView === "graph") void showGraph();
          else changeView(nextView);
        }}
      />
      <div className="app-workspace">
        {view === "document" && (
          <nav
            className="mobile-panel-switcher"
            aria-label={t("mobile.workspace")}
          >
            <button
              type="button"
              className={mobileWorkspacePane === "navigation" ? "active" : ""}
              aria-pressed={mobileWorkspacePane === "navigation"}
              onClick={() => {
                setLeftPanelOpen(true);
                setMobileWorkspacePane("navigation");
              }}
            >
              <PanelLeftOpen />
              <span>{t("mobile.navigation")}</span>
            </button>
            <button
              type="button"
              className={mobileWorkspacePane === "content" ? "active" : ""}
              aria-pressed={mobileWorkspacePane === "content"}
              onClick={() => setMobileWorkspacePane("content")}
            >
              <FileText />
              <span>{t("mobile.content")}</span>
            </button>
            <button
              type="button"
              className={mobileWorkspacePane === "details" ? "active" : ""}
              aria-pressed={mobileWorkspacePane === "details"}
              disabled={!active}
              onClick={() => {
                setRightPanelOpen(true);
                setMobileWorkspacePane("details");
              }}
            >
              <PanelRightOpen />
              <span>{t("mobile.details")}</span>
            </button>
          </nav>
        )}
        <ResizablePanelGroup direction="horizontal">
          {leftPanelOpen && (
            <>
              <ResizablePanel
                id="knowledge-tree"
                data-mobile-pane="navigation"
                data-mobile-active={
                  mobileWorkspacePane === "navigation" ? "true" : "false"
                }
                defaultSize="20%"
                minSize="14%"
                maxSize="34%"
              >
                <KnowledgeTree
                  pages={filtered}
                  deletedPages={deletedPages}
                  vaults={wikis}
                  activeVaultId={currentWiki?.id ?? null}
                  activeVaultTitle={currentWiki?.title ?? "Liminal Wiki"}
                  activePageId={pendingPageId ?? active?.id ?? null}
                  pendingPageId={pendingPageId}
                  currentFolderId={currentFolderId}
                  canWrite={caps.can_write}
                  canCreateVault={caps.can_create_wiki}
                  onOpenPage={(pageId) => void openPage(pageId)}
                  onCreatePage={startCreateItem}
                  onMovePage={(pageId, parentId) =>
                    void movePageTo(pageId, parentId)
                  }
                  onSwitchVault={(wikiId) => void switchVault(wikiId)}
                  onCreateVault={() => {
                    setNewVaultTitle("");
                    setNewVaultTemplate("empty");
                    setVaultDialogOpen(true);
                  }}
                  onRestorePage={(page) => {
                    const original = deletedPages.find(
                      (candidate) => candidate.id === page.id,
                    );
                    if (original) void restoreDeleted(original);
                  }}
                />
              </ResizablePanel>
              <ResizableHandle className="workspace-resize-handle" />
            </>
          )}

          <ResizablePanel
            id="wiki-content"
            data-mobile-pane="content"
            data-mobile-active={
              view !== "document" || mobileWorkspacePane === "content"
                ? "true"
                : "false"
            }
            minSize="38%"
          >
            <section className="workspace-main">
              {view !== "graph" && (
                <header className="workspace-topbar">
                  <div className="workspace-breadcrumbs">
                    {!leftPanelOpen && (
                      <button
                        type="button"
                        className="topbar-icon-button"
                        onClick={() => setLeftPanelOpen(true)}
                        aria-label={t("nav.sidebarOpen")}
                      >
                        <ChevronRight />
                      </button>
                    )}
                    <button
                      type="button"
                      className="breadcrumb-link"
                      onClick={() => changeView("document")}
                    >
                      {currentWiki?.title ?? "Liminal Wiki"}
                    </button>
                    {view === "document" ? (
                      breadcrumbPages.map((page, index) => (
                        <span className="breadcrumb-segment" key={page.id}>
                          <ChevronRight />
                          {index === breadcrumbPages.length - 1 ? (
                            <strong>{page.title}</strong>
                          ) : (
                            <button
                              type="button"
                              className="breadcrumb-link"
                              data-page-id={page.id}
                              onClick={openBreadcrumbPage}
                            >
                              {page.title}
                            </button>
                          )}
                        </span>
                      ))
                    ) : (
                      <>
                        <ChevronRight />
                        <strong>
                          {view === "operations"
                            ? t("nav.operations")
                            : view === "search"
                              ? t("nav.search")
                              : t("nav.graph")}
                        </strong>
                      </>
                    )}
                  </div>
                  <div className="workspace-actions">
                    {writeMode === "read_only" && (
                      <span
                        className="readonly-badge"
                        title={writeModeReason ?? t("page.readOnlyHint")}
                      >
                        {t("page.readOnly")}
                      </span>
                    )}
                    <span
                      className={"sync-state " + (dirty ? "dirty" : "")}
                      role="status"
                      aria-label={dirty ? t("page.unsaved") : status}
                      title={dirty ? t("page.unsaved") : status}
                    >
                      <i />
                      <span>{dirty ? t("page.unsaved") : status}</span>
                    </span>
                    <details
                      className="topbar-settings"
                      onBlur={(event) => {
                        if (
                          !event.currentTarget.contains(
                            event.relatedTarget as Node | null,
                          )
                        ) {
                          event.currentTarget.removeAttribute("open");
                        }
                      }}
                    >
                      <summary
                        className="topbar-icon-button"
                        aria-label={t("page.settings")}
                        title={t("page.settings")}
                      >
                        <Settings2 />
                      </summary>
                      <div className="topbar-settings-menu">
                        <strong>{t("page.settings")}</strong>
                        <label className="topbar-settings-language">
                          <span>
                            <Languages aria-hidden="true" />
                            {t("language.selector")}
                          </span>
                          <select
                            value={language}
                            aria-label={t("language.selector")}
                            onChange={(event) =>
                              setLanguage(event.target.value as Language)
                            }
                          >
                            {languageOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          onClick={(event) => {
                            const next =
                              !document.documentElement.classList.contains(
                                "dark",
                              );
                            setDarkMode(next);
                            document.documentElement.classList.toggle(
                              "dark",
                              next,
                            );
                            window.localStorage.setItem(
                              "liminal-wiki:theme-v2",
                              next ? "dark" : "light",
                            );
                            event.currentTarget
                              .closest("details")
                              ?.removeAttribute("open");
                          }}
                        >
                          {darkMode ? <Sun /> : <Moon />}
                          {darkMode
                            ? t("page.lightTheme")
                            : t("page.darkTheme")}
                        </button>
                        {view === "document" && (
                          <button
                            type="button"
                            className="context-panel-toggle"
                            onClick={(event) => {
                              setRightPanelOpen((value) => !value);
                              event.currentTarget
                                .closest("details")
                                ?.removeAttribute("open");
                            }}
                          >
                            {rightPanelOpen ? (
                              <PanelRightClose />
                            ) : (
                              <PanelRightOpen />
                            )}
                            {rightPanelOpen
                              ? t("page.detailsClose")
                              : t("page.detailsOpen")}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(event) => {
                            changeView("operations");
                            event.currentTarget
                              .closest("details")
                              ?.removeAttribute("open");
                          }}
                          disabled={!caps.can_export_portable}
                        >
                          <Upload aria-hidden="true" />
                          {t("page.backup")}
                        </button>
                      </div>
                    </details>
                    <details
                      className="topbar-profile"
                      onBlur={(event) => {
                        if (
                          !event.currentTarget.contains(
                            event.relatedTarget as Node | null,
                          )
                        ) {
                          event.currentTarget.removeAttribute("open");
                        }
                      }}
                    >
                      <summary
                        className="workspace-avatar"
                        aria-label={t("page.profile")}
                        title={t("page.profile")}
                      >
                        {identityInitials(identity)}
                      </summary>
                      <div className="topbar-profile-menu">
                        <span className="topbar-profile-label">
                          {t("page.signedInAs")}
                        </span>
                        <strong>
                          {identity?.display_name || identity?.email}
                        </strong>
                        {identity?.display_name && identity.email && (
                          <span className="topbar-profile-email">
                            {identity.email}
                          </span>
                        )}
                        <a
                          href="/signout-with-chatgpt?return_to=%2F"
                          target="_top"
                        >
                          <LogOut aria-hidden="true" />
                          {t("page.signOut")}
                        </a>
                      </div>
                    </details>
                  </div>
                </header>
              )}

              <div className="workspace-content">
                <Suspense fallback={<WorkspaceLoading />}>
                  {view === "operations" ? (
                    <OperationsPanel
                      capabilities={caps}
                      siteVersion={siteVersion}
                      hasWiki
                      writeMode={writeMode}
                      writeModeReason={writeModeReason}
                      onWorkspaceChanged={() => loadWorkspace(true)}
                    />
                  ) : view === "search" ? (
                    <SearchView
                      query={query}
                      pages={filtered}
                      onQueryChange={setQuery}
                      onOpenPage={(pageId) => void openPage(pageId)}
                    />
                  ) : view === "graph" ? (
                    <GraphView
                      graph={graph}
                      loading={graphLoading}
                      onRefresh={() => void showGraph()}
                      onOpenPage={(pageId) => void openPage(pageId)}
                    />
                  ) : (
                    <WikiEditor
                      title={active?.title ?? ""}
                      pageType={active?.page_type?.toUpperCase() ?? "WIKI PAGE"}
                      version={active?.version ?? null}
                      markdown={markdown}
                      mode={mode}
                      dirty={dirty}
                      canWrite={caps.can_write}
                      autosavePaused={autosavePaused}
                      onModeChange={setMode}
                      onMarkdownChange={(nextMarkdown) => {
                        markdownRef.current = nextMarkdown;
                        dirtyRef.current = nextMarkdown !== savedMarkdown;
                        setMarkdown(nextMarkdown);
                      }}
                      onAutosaveToggle={() =>
                        updateAutosavePaused(!autosavePausedRef.current)
                      }
                      onSave={() => void save()}
                      onWikiLink={openWikiLink}
                      headerActions={
                        <>
                          <div
                            className="page-share-actions"
                            role="group"
                            aria-label={t("page.copyShare")}
                          >
                            <button
                              type="button"
                              className="page-share-action"
                              onClick={() => void copyActiveLink()}
                              disabled={!active || !currentWiki}
                              title={t("page.copyLink")}
                              aria-label={t("page.copyLink")}
                            >
                              <Link2 /> <span>{t("page.link")}</span>
                            </button>
                            <button
                              type="button"
                              className="page-share-action"
                              onClick={() => void copyActiveMarkdown()}
                              disabled={!active}
                              title={t("page.copyMarkdown")}
                              aria-label={t("page.copyMarkdown")}
                            >
                              <Copy /> <span>{t("page.content")}</span>
                            </button>
                            <button
                              type="button"
                              className="page-share-action codex"
                              onClick={() => void copyCodexRequest()}
                              disabled={!active || !currentWiki}
                              title={t("page.copyCodex")}
                              aria-label={t("page.copyCodex")}
                            >
                              <Bot /> <span>Codex</span>
                            </button>
                          </div>
                          <button
                            type="button"
                            className="editor-icon-action"
                            onClick={() => {
                              setMoveParentId(active?.parent_id ?? null);
                              setMoveDialogOpen(true);
                            }}
                            disabled={!active || dirty || !caps.can_write}
                            title={t("page.move")}
                            aria-label={t("page.move")}
                          >
                            <Move />
                          </button>
                          <button
                            type="button"
                            className="editor-icon-action destructive"
                            onClick={() => void deleteActivePage()}
                            disabled={!active || dirty || !caps.can_soft_delete}
                            title={t("page.delete")}
                            aria-label={t("page.delete")}
                          >
                            <Trash2 />
                          </button>
                        </>
                      }
                      alerts={
                        <>
                          {notice && (
                            <div className="inline-notice" role="alert">
                              <span>{notice}</span>
                              <button
                                type="button"
                                onClick={() => setNotice(null)}
                                aria-label={t("page.closeNotice")}
                              >
                                ×
                              </button>
                            </div>
                          )}
                          {editConflict && (
                            <section
                              className="conflict-resolver"
                              aria-label="편집 충돌 해결"
                            >
                              <header>
                                <div>
                                  <span>VERSION CONFLICT</span>
                                  <h3>최신 변경과 내 초안을 함께 검토하세요</h3>
                                </div>
                                <small>
                                  읽은 버전 {editConflict.baseVersion} · 최신
                                  버전 {editConflict.latest.version}
                                </small>
                              </header>
                              <div className="conflict-columns">
                                <label>
                                  <span>최신 버전</span>
                                  <textarea
                                    readOnly
                                    value={editConflict.latest.markdown}
                                  />
                                </label>
                                <label>
                                  <span>내 초안</span>
                                  <textarea
                                    readOnly
                                    value={editConflict.draft}
                                  />
                                </label>
                                <label>
                                  <span>줄 단위 diff</span>
                                  <pre>{editConflict.diff}</pre>
                                </label>
                              </div>
                              <div className="conflict-actions">
                                <button
                                  type="button"
                                  onClick={beginConflictMerge}
                                >
                                  병합 초안 만들기
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void saveConflictAsNewPage()}
                                >
                                  내 초안을 새 페이지로 저장
                                </button>
                              </div>
                              <p>
                                병합 초안의 충돌 표식을 정리한 뒤 변경을
                                저장하세요. 자동 저장은 그때까지 일시
                                중지됩니다.
                              </p>
                            </section>
                          )}
                        </>
                      }
                    />
                  )}
                </Suspense>
              </div>
            </section>
          </ResizablePanel>

          {view === "document" && rightPanelOpen && (
            <>
              <ResizableHandle className="workspace-resize-handle" />
              <ResizablePanel
                id="page-context"
                data-mobile-pane="details"
                data-mobile-active={
                  mobileWorkspacePane === "details" ? "true" : "false"
                }
                defaultSize="22%"
                minSize="18%"
                maxSize="36%"
              >
                <aside className="context-panel">
                  <header className="context-panel-header">
                    <div>
                      <strong>{t("page.detailsTitle")}</strong>
                      <span>{active?.page_type ?? "wiki page"}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setRightPanelOpen(false);
                        setMobileWorkspacePane("content");
                      }}
                      aria-label={t("page.detailsClose")}
                    >
                      <PanelRightClose />
                    </button>
                  </header>

                  <section className="context-section">
                    <div className="context-section-title">
                      <span>
                        <Link2 /> {t("page.linkedMentions")}
                      </span>
                      <b>{linkedPages.length}</b>
                    </div>
                    <div className="context-list">
                      {linkedPages.length ? (
                        linkedPages.map((item) => (
                          <button
                            type="button"
                            className="context-row"
                            key={item.id ?? item.title}
                            onClick={() =>
                              item.id ? void openPage(item.id) : undefined
                            }
                          >
                            <FileText />
                            <span>
                              <strong>{item.title}</strong>
                              <small>
                                {item.direction === "out"
                                  ? t("page.outgoingLink")
                                  : t("page.backlink")}
                              </small>
                            </span>
                            <ChevronRight />
                          </button>
                        ))
                      ) : (
                        <p className="context-empty">{t("page.noLinks")}</p>
                      )}
                    </div>
                  </section>

                  <section className="context-section">
                    <div className="context-section-title">
                      <span>
                        <Paperclip /> {t("page.attachments")}
                      </span>
                      <b>
                        {
                          attachments.filter((item) => item.status === "ready")
                            .length
                        }
                      </b>
                    </div>
                    {caps.can_manage_attachments && (
                      <label className="attachment-upload">
                        <Upload /> {t("page.addFile")}
                        <input
                          type="file"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void uploadFile(file);
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                    )}
                    <div className="context-list">
                      {attachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className={
                            "attachment-row " +
                            (attachment.status !== "ready" ? "deleted" : "")
                          }
                        >
                          <Paperclip />
                          <span>
                            <a
                              href={
                                attachment.status === "ready"
                                  ? "/api/attachments/" + attachment.id
                                  : undefined
                              }
                            >
                              {attachment.filename}
                            </a>
                            <small>
                              {Math.max(
                                1,
                                Math.round(attachment.size_bytes / 1024),
                              )}{" "}
                              KB · {attachment.status}
                            </small>
                          </span>
                          {caps.can_manage_attachments &&
                            (attachment.status === "ready" ? (
                              <button
                                type="button"
                                onClick={() =>
                                  void deleteAttachment(attachment)
                                }
                                aria-label={attachment.filename + " 삭제"}
                              >
                                <Trash2 />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  void restoreAttachment(attachment)
                                }
                                aria-label={attachment.filename + " 복구"}
                              >
                                <RotateCcw />
                              </button>
                            ))}
                        </div>
                      ))}
                      {!attachments.length && (
                        <p className="context-empty">
                          {t("page.noAttachments")}
                        </p>
                      )}
                    </div>
                  </section>

                  <section className="context-section revision-section">
                    <div className="context-section-title">
                      <span>
                        <Clock3 /> {t("page.versionHistory")}
                      </span>
                      <b>{revisions.length}</b>
                    </div>
                    <ol className="revision-list">
                      {revisions.slice(0, 8).map((revision) => (
                        <li key={revision.version}>
                          <i />
                          <div>
                            <strong>
                              {revision.change_summary ?? t("page.pageChange")}
                            </strong>
                            <small>
                              {revision.origin} ·{" "}
                              {new Date(revision.created_at).toLocaleString(
                                "ko-KR",
                                {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}
                            </small>
                            {revision.version !== active?.version &&
                              caps.can_restore && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void restoreRevision(revision.version)
                                  }
                                  disabled={dirty}
                                >
                                  {t("page.restoreVersion")}
                                </button>
                              )}
                          </div>
                          <span>v{revision.version}</span>
                        </li>
                      ))}
                    </ol>
                  </section>
                </aside>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
      {createTarget && (
        <WorkspaceDialog
          title={
            createTarget.kind === "folder"
              ? t("tree.newFolder")
              : t("tree.newPage")
          }
          description={
            createTarget.parentId
              ? t("dialog.createFolderDescription")
              : t("dialog.createRootDescription")
          }
          confirmLabel={t("common.create")}
          confirmDisabled={!newItemTitle.trim()}
          onConfirm={() => void createNewPage()}
          onClose={() => setCreateTarget(null)}
        >
          <label className="workspace-dialog-field">
            <span>{t("dialog.title")}</span>
            <input
              autoFocus
              value={newItemTitle}
              onChange={(event) => setNewItemTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && newItemTitle.trim())
                  void createNewPage();
              }}
              placeholder={
                createTarget.kind === "folder"
                  ? t("dialog.folderExample")
                  : t("dialog.pageExample")
              }
            />
          </label>
          <label className="workspace-dialog-field">
            <span>{t("dialog.startMethod")}</span>
            <select
              value={newVaultTemplate}
              onChange={(event) =>
                setNewVaultTemplate(event.target.value as "empty" | "starter")
              }
            >
              <option value="empty">{t("dialog.emptyVault")}</option>
              <option value="starter">{t("dialog.starterVault")}</option>
            </select>
          </label>
        </WorkspaceDialog>
      )}
      {moveDialogOpen && active && (
        <WorkspaceDialog
          title={t("dialog.moveTitle", { title: active.title })}
          description={t("dialog.moveDescription")}
          confirmLabel={t("dialog.moveConfirm")}
          onConfirm={() => void movePageTo(active.id, moveParentId)}
          onClose={() => setMoveDialogOpen(false)}
        >
          <div
            className="move-tree"
            role="tree"
            aria-label={t("dialog.moveTree")}
          >
            <label className={moveParentId === null ? "selected" : ""}>
              <input
                type="radio"
                name="move-parent"
                checked={moveParentId === null}
                onChange={() => setMoveParentId(null)}
              />
              <span>▣</span>
              <strong>{currentWiki?.title ?? "Vault"}</strong>
              <small>root</small>
            </label>
            {pages
              .filter((page) => page.page_type === "folder")
              .map((folder) => (
                <label
                  key={folder.id}
                  className={moveParentId === folder.id ? "selected" : ""}
                  aria-disabled={invalidMoveFolderIds.has(folder.id)}
                >
                  <input
                    type="radio"
                    name="move-parent"
                    checked={moveParentId === folder.id}
                    disabled={invalidMoveFolderIds.has(folder.id)}
                    onChange={() => setMoveParentId(folder.id)}
                  />
                  <span>▾</span>
                  <strong>{folder.title}</strong>
                  <small>{folder.path}</small>
                </label>
              ))}
          </div>
        </WorkspaceDialog>
      )}
      {vaultDialogOpen && (
        <WorkspaceDialog
          title={t("tree.newVault")}
          description={t("dialog.newVaultDescription")}
          confirmLabel={t("dialog.createVault")}
          confirmDisabled={!newVaultTitle.trim()}
          onConfirm={() => void createVault()}
          onClose={() => setVaultDialogOpen(false)}
        >
          <label className="workspace-dialog-field">
            <span>{t("dialog.vaultName")}</span>
            <input
              autoFocus
              value={newVaultTitle}
              onChange={(event) => setNewVaultTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && newVaultTitle.trim())
                  void createVault();
              }}
              placeholder={t("dialog.vaultExample")}
            />
          </label>
        </WorkspaceDialog>
      )}
    </main>
  );
}
