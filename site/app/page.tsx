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
  ChevronRight,
  Clock3,
  Copy,
  FileText,
  Languages,
  Layers3,
  Link2,
  LogOut,
  MessageSquareText,
  Moon,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  Settings2,
  Sun,
  Upload,
} from "lucide-react";
import {
  buildPagePermalink,
  readPagePermalink,
  type PagePermalinkTarget,
} from "@/lib/page-sharing";
import { ChangeRequestDialog } from "@/components/change-request-dialog";
import type {
  ChangeRequestContext,
  ChangeRequestKind,
  ChangeRequestScope,
} from "@/lib/change-request";
import { SiteTools } from "./site-tools";
import {
  IconSidebar,
  type WorkspaceView,
} from "@/components/layout/icon-sidebar";
import { KnowledgeTree } from "@/components/layout/knowledge-tree";
import type { KnowledgeMapData } from "@/components/knowledge/knowledge-atlas";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  languageOptions,
  useI18n,
  type Language,
  type TranslationKey,
} from "@/components/i18n-provider";

const loadOperationsPanel = () => import("./operations-panel");
const loadWikiReader = () => import("@/components/editor/wiki-editor");
const loadGraphView = () => import("@/components/graph/graph-view");
const loadSearchView = () => import("@/components/search/search-view");
const loadKnowledgeAtlas = () =>
  import("@/components/knowledge/knowledge-atlas");

const OperationsPanel = lazy(() =>
  loadOperationsPanel().then((module) => ({
    default: module.OperationsPanel,
  })),
);
const WikiReader = lazy(() =>
  loadWikiReader().then((module) => ({
    default: module.WikiReader,
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
const KnowledgeAtlas = lazy(() =>
  loadKnowledgeAtlas().then((module) => ({
    default: module.KnowledgeAtlas,
  })),
);

const EMPTY_KNOWLEDGE_MAP: KnowledgeMapData = {
  exists: false,
  version: 0,
  overview_brief: null,
  overview_brief_status: "missing",
  topics: [],
  placements: [],
  unmapped_pages: [],
  warnings: [],
};

const pageTypeKeys: Record<string, TranslationKey> = {
  overview: "type.overview",
  concept: "type.concept",
  entity: "type.entity",
  note: "type.note",
  source: "type.source",
  synthesis: "type.synthesis",
  comparison: "type.comparison",
  query: "type.query",
  folder: "type.folder",
  other: "type.other",
};

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
type StatusMessage = {
  key: TranslationKey;
  values?: Record<string, string | number>;
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
type ChangeRequestState = {
  contexts: Partial<Record<ChangeRequestScope, ChangeRequestContext>>;
  initialScope: ChangeRequestScope;
  initialKind?: ChangeRequestKind;
  initialDetails?: string;
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

function WorkspaceDialog({
  title,
  description,
  children,
  confirmLabel,
  confirmTone = "primary",
  confirmDisabled,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  confirmLabel: string;
  confirmTone?: "primary" | "destructive";
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
            className={confirmTone}
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
  const [view, setView] = useState<WorkspaceView>("document");
  const [treeMode, setTreeMode] = useState<"knowledge" | "files">("files");
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
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [neighbors, setNeighbors] = useState<Neighbor[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [knowledgeMap, setKnowledgeMap] =
    useState<KnowledgeMapData>(EMPTY_KNOWLEDGE_MAP);
  const [selectedKnowledgeTopicId, setSelectedKnowledgeTopicId] = useState<
    string | null
  >(null);
  const [pendingPageId, setPendingPageId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchIds, setSearchIds] = useState<Set<string> | null>(null);
  const [statusMessage, setStatusMessage] = useState<StatusMessage>({
    key: "status.connecting",
  });
  const setStatus = useCallback(
    (key: TranslationKey, values?: Record<string, string | number>) =>
      setStatusMessage({ key, values }),
    [],
  );
  const status = t(statusMessage.key, statusMessage.values);
  const [caps, setCaps] = useState<Caps>(EMPTY_CAPABILITIES);
  const [identity, setIdentity] = useState<SessionIdentity | null>(null);
  const [currentWiki, setCurrentWiki] = useState<WikiSummary | null>(null);
  const [wikis, setWikis] = useState<WikiSummary[]>([]);
  const [changeRequest, setChangeRequest] = useState<ChangeRequestState | null>(
    null,
  );
  const [vaultDialogOpen, setVaultDialogOpen] = useState(false);
  const [newVaultTitle, setNewVaultTitle] = useState("");
  const [deleteWikiDialogOpen, setDeleteWikiDialogOpen] = useState(false);
  const [deleteWikiConfirmation, setDeleteWikiConfirmation] = useState("");
  const [deleteWikiBackupAcknowledged, setDeleteWikiBackupAcknowledged] =
    useState(false);
  const [deleteWikiPending, setDeleteWikiPending] = useState(false);
  const [deleteWikiError, setDeleteWikiError] = useState<string | null>(null);
  const [siteVersion, setSiteVersion] = useState(1);
  const [writeMode, setWriteMode] = useState<"read_write" | "read_only">(
    "read_write",
  );
  const [writeModeReason, setWriteModeReason] = useState<string | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const viewRef = useRef(view);
  const activeRef = useRef<Page | null>(null);
  const pagesRef = useRef<Page[]>([]);
  const pageDetailsCacheRef = useRef(new Map<string, PageDetails>());
  const desiredPageIdRef = useRef<string | null>(null);
  const openPageRequestRef = useRef(0);
  const workspaceRequestRef = useRef(0);
  const graphRequestRef = useRef(0);
  const currentWikiIdRef = useRef<string | null>(null);
  const initialPermalinkRef = useRef<PagePermalinkTarget | null>(null);
  const permalinkReadRef = useRef(false);
  const changeView = useCallback((nextView: WorkspaceView) => {
    // Keep asynchronous workspace hydration from restoring the document view
    // after the user has already navigated elsewhere in the same event turn.
    viewRef.current = nextView;
    setView(nextView);
    if (nextView === "document") setTreeMode("files");
    if (nextView === "knowledge") setTreeMode("knowledge");
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
        loadKnowledgeAtlas(),
      ]);
    };
    const idle = window.requestIdleCallback(preloadSecondaryViews, {
      timeout: 2_000,
    });
    return () => window.cancelIdleCallback(idle);
  }, []);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
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
    async (pageId: string, preserveView = false) => {
      if (
        preserveView &&
        desiredPageIdRef.current &&
        desiredPageIdRef.current !== pageId
      )
        return;
      if (!preserveView) desiredPageIdRef.current = pageId;
      const requestNumber = ++openPageRequestRef.current;
      const snapshot = pagesRef.current.find((page) => page.id === pageId);
      const cached = pageDetailsCacheRef.current.get(pageId);
      const validCache =
        cached && (!snapshot || cached.page.version === snapshot.version)
          ? cached
          : null;

      if (!preserveView) {
        changeView("document");
        setMobileWorkspacePane("content");
      }
      setPendingPageId(pageId);
      const immediatePage = validCache?.page ?? snapshot;
      if (immediatePage) {
        desiredPageIdRef.current = immediatePage.id;
        activeRef.current = immediatePage;
        setActive(immediatePage);
        setMarkdown(immediatePage.markdown);
        setRevisions(validCache?.revisions ?? []);
        setNeighbors(validCache?.neighbors ?? []);
        setAttachments(validCache?.attachments ?? []);
        setStatus(
          validCache ? "status.verifyingLatest" : "status.syncingDetails",
        );
        setNotice(null);
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
            `/api/attachments?page_id=${encodeURIComponent(pageId)}`,
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
        desiredPageIdRef.current = page.id;
        activeRef.current = page;
        setActive(page);
        replacePageSnapshot(page);
        setMarkdown(page.markdown);
        setRevisions(history);
        setNeighbors(linked);
        setAttachments(files);
        setStatus("status.synced");
        setNotice(null);
      } catch (error) {
        if (requestNumber !== openPageRequestRef.current) return;
        setStatus(
          snapshot || validCache
            ? "status.cachedContent"
            : "status.connectionFailed",
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
    [changeView, replacePageSnapshot, setStatus],
  );

  const openBreadcrumbPage = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const pageId = event.currentTarget.dataset.pageId;
      if (pageId) void openPage(pageId);
    },
    [openPage],
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
          setKnowledgeMap(EMPTY_KNOWLEDGE_MAP);
          setSelectedKnowledgeTopicId(null);
          openPageRequestRef.current++;
          desiredPageIdRef.current = null;
          activeRef.current = null;
          setActive(null);
          setMarkdown("");
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
              ? "status.setupRequired"
              : "status.readDenied",
          );
          return;
        }
        const [accessible, map] = await Promise.all([
          api<{ wikis: WikiSummary[] }>("/api/wikis"),
          api<KnowledgeMapData>("/api/knowledge-map"),
        ]);
        if (requestNumber !== workspaceRequestRef.current) return;
        setWikis(accessible.wikis);
        setKnowledgeMap(map);
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
        if (refreshActive && viewRef.current === "document") {
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
        } else setStatus("status.listRefreshed");
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
          setRevisions([]);
          setNeighbors([]);
          setAttachments([]);
          setGraph(null);
          setKnowledgeMap(EMPTY_KNOWLEDGE_MAP);
          setSelectedKnowledgeTopicId(null);
          setStatus("status.signInRequired");
          setNotice(null);
        } else {
          setStatus("status.connectionFailed");
          setNotice(
            error instanceof Error
              ? error.message
              : "위키를 불러오지 못했습니다.",
          );
        }
      }
    },
    [openPage, setStatus],
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
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [changeView]);
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

  async function switchVault(wikiId: string) {
    if (!wikiId || wikiId === currentWiki?.id) return;
    try {
      setStatus("status.switchingWiki");
      graphRequestRef.current++;
      openPageRequestRef.current++;
      desiredPageIdRef.current = null;
      activeRef.current = null;
      setActive(null);
      setMarkdown("");
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
    try {
      setStatus("status.creatingWiki");
      graphRequestRef.current++;
      openPageRequestRef.current++;
      desiredPageIdRef.current = null;
      activeRef.current = null;
      setActive(null);
      setMarkdown("");
      setPages([]);
      setDeletedPages([]);
      setGraph(null);
      pageDetailsCacheRef.current.clear();
      await api("/api/wikis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: newVaultTitle.trim(),
          template: "empty",
          operation_id: crypto.randomUUID(),
        }),
      });
      setVaultDialogOpen(false);
      setNewVaultTitle("");
      await loadWorkspace(true);
      setStatus("status.wikiCreated");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Vault를 만들지 못했습니다.",
      );
      await loadWorkspace(true);
    }
  }

  function openDeleteWikiDialog() {
    if (!currentWiki || !caps.can_create_wiki || wikis.length < 2) return;
    setDeleteWikiConfirmation("");
    setDeleteWikiBackupAcknowledged(false);
    setDeleteWikiError(null);
    setDeleteWikiDialogOpen(true);
  }

  async function deleteCurrentWiki() {
    if (
      !currentWiki ||
      !caps.can_create_wiki ||
      wikis.length < 2 ||
      deleteWikiPending ||
      !deleteWikiBackupAcknowledged ||
      deleteWikiConfirmation !== `DELETE ${currentWiki.title}`
    )
      return;
    const deletedTitle = currentWiki.title;
    setDeleteWikiPending(true);
    setDeleteWikiError(null);
    try {
      await api(`/api/wikis/${currentWiki.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirmation: deleteWikiConfirmation,
          backup_acknowledged: deleteWikiBackupAcknowledged,
          operation_id: crypto.randomUUID(),
        }),
      });
      setDeleteWikiDialogOpen(false);
      setDeleteWikiConfirmation("");
      setDeleteWikiBackupAcknowledged(false);
      await loadWorkspace(true);
      setStatus("status.wikiDeleted", { title: deletedTitle });
    } catch (error) {
      setDeleteWikiError(
        error instanceof Error ? error.message : t("dialog.deleteWikiFailed"),
      );
    } finally {
      setDeleteWikiPending(false);
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
      setNotice("페이지 Markdown을 복사했습니다.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "본문을 복사하지 못했습니다.",
      );
    }
  }

  const requestsEnabled =
    caps.can_write && writeMode === "read_write" && Boolean(currentWiki);

  function pageRequestContext(
    page: Page,
    scope: "page" | "revision" | "deleted_page" = "page",
    restoreVersion?: number,
  ): ChangeRequestContext | null {
    if (!currentWiki) return null;
    return {
      language,
      wiki: { id: currentWiki.id, title: currentWiki.title },
      scope,
      page: {
        id: page.id,
        title: page.title,
        pageType: page.page_type,
        path: page.path,
        version: page.version,
        permalink: buildPagePermalink(
          window.location.href,
          currentWiki.id,
          page.id,
        ),
      },
      restoreVersion,
    };
  }

  function openChangeRequest(options?: {
    initialScope?: ChangeRequestScope;
    initialKind?: ChangeRequestKind;
    page?: Page;
    restoreVersion?: number;
    initialDetails?: string;
  }) {
    if (!requestsEnabled || !currentWiki) {
      setNotice(writeModeReason || t("request.unavailable"));
      return;
    }
    const contexts: ChangeRequestState["contexts"] = {
      wiki: {
        language,
        wiki: { id: currentWiki.id, title: currentWiki.title },
        scope: "wiki",
      },
    };
    const targetPage = options?.page ?? active;
    if (targetPage) contexts.page = pageRequestContext(targetPage) ?? undefined;
    const topic = knowledgeMap.topics.find(
      (candidate) => candidate.id === selectedKnowledgeTopicId,
    );
    if (topic)
      contexts.topic = {
        language,
        wiki: { id: currentWiki.id, title: currentWiki.title },
        scope: "topic",
        topic: { id: topic.id, title: topic.title },
      };
    if (targetPage && options?.initialScope === "revision")
      contexts.revision =
        pageRequestContext(targetPage, "revision", options.restoreVersion) ??
        undefined;
    if (targetPage && options?.initialScope === "deleted_page")
      contexts.deleted_page =
        pageRequestContext(targetPage, "deleted_page") ?? undefined;
    const preferredScope =
      options?.initialScope ??
      (view === "document" && contexts.page
        ? "page"
        : view === "knowledge" && contexts.topic
          ? "topic"
          : "wiki");
    setChangeRequest({
      contexts,
      initialScope: preferredScope,
      initialKind: options?.initialKind,
      initialDetails: options?.initialDetails,
    });
  }

  async function copyChangeRequest(prompt: string) {
    try {
      await copyText(prompt);
      setNotice(t("request.copySuccess"));
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Codex 요청을 복사하지 못했습니다.",
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
          key={`${writeMode}-${caps.can_write}-${caps.can_create_wiki}-${caps.can_soft_delete}`}
        />
        <Suspense fallback={<WorkspaceLoading />}>
          <OperationsPanel
            capabilities={caps}
            siteVersion={siteVersion}
            hasWiki={false}
            writeMode={writeMode}
            writeModeReason={writeModeReason}
            currentWikiId={null}
            currentWikiTitle=""
            canDeleteWiki={false}
            onWorkspaceChanged={() => loadWorkspace(true)}
          />
        </Suspense>
      </main>
    );

  return (
    <main className="wiki-app">
      <SiteTools
        key={`${writeMode}-${caps.can_write}-${caps.can_create_wiki}-${caps.can_soft_delete}`}
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
                  treeMode={treeMode}
                  pages={pages}
                  deletedPages={deletedPages}
                  vaults={wikis}
                  activeVaultId={currentWiki?.id ?? null}
                  activeVaultTitle={currentWiki?.title ?? "Liminal Wiki"}
                  activePageId={pendingPageId ?? active?.id ?? null}
                  pendingPageId={pendingPageId}
                  knowledgeMap={knowledgeMap}
                  selectedKnowledgeTopicId={selectedKnowledgeTopicId}
                  onOpenPage={(pageId) => void openPage(pageId)}
                  onOpenKnowledgeTopic={(topicId) => {
                    setSelectedKnowledgeTopicId(topicId);
                    changeView("knowledge");
                    setMobileWorkspacePane("content");
                  }}
                  onSwitchVault={(wikiId) => void switchVault(wikiId)}
                  onRequestRestore={(page) => {
                    const original = deletedPages.find(
                      (candidate) => candidate.id === page.id,
                    );
                    if (original)
                      openChangeRequest({
                        page: original,
                        initialScope: "deleted_page",
                        initialKind: "restore_deleted",
                      });
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
                            : view === "knowledge"
                              ? t("nav.knowledge")
                              : view === "search"
                                ? t("nav.search")
                                : t("nav.graph")}
                        </strong>
                      </>
                    )}
                  </div>
                  <div className="workspace-actions">
                    {view !== "document" && (
                      <button
                        type="button"
                        className="topbar-request-button"
                        onClick={() => openChangeRequest()}
                        disabled={!requestsEnabled}
                        title={
                          requestsEnabled
                            ? t("request.open")
                            : writeModeReason || t("request.unavailable")
                        }
                      >
                        <MessageSquareText aria-hidden="true" />
                        <span>{t("request.open")}</span>
                      </button>
                    )}
                    {writeMode === "read_only" && (
                      <span
                        className="readonly-badge"
                        title={writeModeReason ?? t("page.readOnlyHint")}
                      >
                        {t("page.readOnly")}
                      </span>
                    )}
                    <span
                      className="sync-state"
                      role="status"
                      aria-label={status}
                      title={status}
                    >
                      <i />
                      <span>{status}</span>
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
                      currentWikiId={currentWiki?.id ?? null}
                      currentWikiTitle={currentWiki?.title ?? ""}
                      canDeleteWiki={wikis.length > 1}
                      onCreateWiki={() => {
                        setNewVaultTitle("");
                        setVaultDialogOpen(true);
                      }}
                      onDeleteWiki={openDeleteWikiDialog}
                      onWorkspaceChanged={() => loadWorkspace(true)}
                    />
                  ) : view === "knowledge" ? (
                    knowledgeMap.exists ? (
                      <KnowledgeAtlas
                        map={knowledgeMap}
                        selectedTopicId={selectedKnowledgeTopicId}
                        onSelectTopic={setSelectedKnowledgeTopicId}
                        onOpenPage={(pageId) => void openPage(pageId)}
                      />
                    ) : (
                      <section className="atlas-fallback">
                        <Layers3 aria-hidden="true" />
                        <h1>{t("atlas.fallbackTitle")}</h1>
                        <p>{t("atlas.fallbackDescription")}</p>
                      </section>
                    )
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
                      activePageId={pendingPageId ?? active?.id ?? null}
                      onRefresh={() => void showGraph()}
                      onOpenPage={(pageId) => void openPage(pageId)}
                      requestAction={
                        <button
                          type="button"
                          className="graph-request-action"
                          onClick={() => openChangeRequest()}
                          disabled={!requestsEnabled}
                          title={
                            requestsEnabled
                              ? t("request.open")
                              : writeModeReason || t("request.unavailable")
                          }
                        >
                          <MessageSquareText aria-hidden="true" />
                          <span>{t("request.open")}</span>
                        </button>
                      }
                    />
                  ) : (
                    <WikiReader
                      title={active?.title ?? ""}
                      pageType={t(
                        pageTypeKeys[active?.page_type ?? "other"] ??
                          "type.other",
                      ).toUpperCase()}
                      version={active?.version ?? null}
                      markdown={markdown}
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
                          </div>
                          <button
                            type="button"
                            className="page-request-action"
                            onClick={() => openChangeRequest()}
                            disabled={!requestsEnabled}
                            title={
                              requestsEnabled
                                ? t("request.open")
                                : writeModeReason || t("request.unavailable")
                            }
                          >
                            <MessageSquareText aria-hidden="true" />
                            <span>{t("request.open")}</span>
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
                      <span>
                        {t(
                          pageTypeKeys[active?.page_type ?? "other"] ??
                            "type.other",
                        )}
                      </span>
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
                    <div className="context-list">
                      {attachments
                        .filter((attachment) => attachment.status === "ready")
                        .map((attachment) => (
                          <div key={attachment.id} className="attachment-row">
                            <Paperclip />
                            <span>
                              <a href={"/api/attachments/" + attachment.id}>
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
                          </div>
                        ))}
                      {!attachments.some(
                        (attachment) => attachment.status === "ready",
                      ) && (
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
                              requestsEnabled && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openChangeRequest({
                                      initialScope: "revision",
                                      initialKind: "restore_revision",
                                      restoreVersion: revision.version,
                                    })
                                  }
                                >
                                  {t("request.restoreRevision")}
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
      {changeRequest && (
        <ChangeRequestDialog
          contexts={changeRequest.contexts}
          initialScope={changeRequest.initialScope}
          initialKind={changeRequest.initialKind}
          initialDetails={changeRequest.initialDetails}
          onClose={() => setChangeRequest(null)}
          onCopy={copyChangeRequest}
        />
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
      {deleteWikiDialogOpen && currentWiki && (
        <WorkspaceDialog
          title={t("dialog.deleteWikiTitle", { title: currentWiki.title })}
          description={t("dialog.deleteWikiDescription")}
          confirmLabel={
            deleteWikiPending
              ? t("dialog.deleteWikiPending")
              : t("dialog.deleteWikiConfirm")
          }
          confirmTone="destructive"
          confirmDisabled={
            deleteWikiPending ||
            !deleteWikiBackupAcknowledged ||
            deleteWikiConfirmation !== `DELETE ${currentWiki.title}`
          }
          onConfirm={() => void deleteCurrentWiki()}
          onClose={() => {
            if (deleteWikiPending) return;
            setDeleteWikiDialogOpen(false);
            setDeleteWikiError(null);
          }}
        >
          <p className="workspace-dialog-warning">
            {t("dialog.deleteWikiBackupNotice")}
          </p>
          <label className="workspace-dialog-checkbox">
            <input
              type="checkbox"
              checked={deleteWikiBackupAcknowledged}
              onChange={(event) =>
                setDeleteWikiBackupAcknowledged(event.target.checked)
              }
            />
            <span>{t("dialog.deleteWikiBackupAcknowledgement")}</span>
          </label>
          <div className="workspace-dialog-confirmation">
            <span>{t("dialog.confirmationPhrase")}</span>
            <code>{`DELETE ${currentWiki.title}`}</code>
          </div>
          <label className="workspace-dialog-field">
            <span>{t("dialog.confirmation")}</span>
            <input
              autoFocus
              value={deleteWikiConfirmation}
              onChange={(event) =>
                setDeleteWikiConfirmation(event.target.value)
              }
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  deleteWikiBackupAcknowledged &&
                  deleteWikiConfirmation === `DELETE ${currentWiki.title}` &&
                  !deleteWikiPending
                )
                  void deleteCurrentWiki();
              }}
              placeholder={`DELETE ${currentWiki.title}`}
              autoComplete="off"
            />
          </label>
          {deleteWikiError && (
            <p className="workspace-dialog-error" role="alert">
              {deleteWikiError}
            </p>
          )}
        </WorkspaceDialog>
      )}
    </main>
  );
}
