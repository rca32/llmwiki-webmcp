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
  ExternalLink,
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
  buildWikiPermalink,
  readPagePermalink,
  type PagePermalinkTarget,
} from "@/lib/page-sharing";
import type { ChangeSet } from "@/lib/contracts";
import { ChangeRequestDialog } from "@/components/change-request-dialog";
import type {
  ChangeRequestContext,
  ChangeRequestKind,
  ChangeRequestScope,
} from "@/lib/change-request";
import { startWorkspaceSyncController } from "@/lib/workspace-sync-controller";
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

const retrievalStatusKeys: Record<string, TranslationKey> = {
  success: "page.retrievalSuccess",
  partial: "page.retrievalPartial",
  failed: "page.retrievalFailed",
  unavailable: "page.retrievalUnavailable",
};

function sourceHostname(sourceUrl: string) {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return sourceUrl;
  }
}

function formatSourceDate(value: string, language: Language) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(language, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function WorkspaceLoading() {
  const { t } = useI18n();
  return (
    <div className="workspace-loading" role="status" aria-live="polite">
      {t("page.loading")}
    </div>
  );
}

type PageSummary = {
  id: string;
  parent_id: string | null;
  title: string;
  page_type: string;
  version: number;
  sort_order: number;
  path: string;
  updated_at: string;
  source_url: string | null;
  retrieval_status: string | null;
  retrieved_at: string | null;
  extraction_method: string | null;
  confidence: number | null;
  deleted_at?: string | null;
};
type Page = PageSummary & { markdown: string };
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
type TrashSummary = {
  wiki_id: string;
  deleted_page_count: number;
  revision_count: number;
  claim_count: number;
  placement_count: number;
  attachment_count: number;
  estimated_bytes: number;
  trash_token: string | null;
  confirmation_phrase: string;
};
type EmptyTrashResult = {
  purged_page_count: number;
  purged_revision_count: number;
  purged_claim_count: number;
  purged_placement_count: number;
  purged_attachment_count: number;
  purged_estimated_bytes: number;
  storage_objects_deleted: number;
  storage_cleanup_pending: number;
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
  can_empty_trash: boolean;
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
  can_empty_trash: false,
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
  | { ok: true; data: T; change_set: ChangeSet | null }
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

function compactBytes(value: number, language: string) {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let amount = value / 1024,
    unit = units[0];
  for (let index = 1; amount >= 1024 && index < units.length; index++) {
    amount /= 1024;
    unit = units[index];
  }
  return `${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(amount)} ${unit}`;
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

async function mutateApi<T>(
  path: string,
  init: RequestInit,
): Promise<{ data: T; changeSet: ChangeSet }> {
  const response = await fetch(path, { ...init, credentials: "same-origin" });
  const envelope = (await response.json()) as Envelope<T>;
  if (!response.ok || !envelope.ok)
    throw envelope.ok
      ? new Error(`Request failed (${response.status})`)
      : Object.assign(new Error(envelope.error.message), {
          code: envelope.error.code,
          details: envelope.error.details,
        });
  return {
    data: envelope.data,
    changeSet: envelope.change_set ?? {
      pages_changed: [],
      tree_changed: true,
      links_changed: true,
      search_changed: true,
      graph_changed: true,
      knowledge_changed: true,
      session_changed: true,
    },
  };
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

export default function WorkspaceApp() {
  const { language, setLanguage, t } = useI18n();
  const [view, setView] = useState<WorkspaceView>("document");
  const [treeMode, setTreeMode] = useState<"knowledge" | "files">("files");
  const [mobileWorkspacePane, setMobileWorkspacePane] = useState<
    "navigation" | "content" | "details"
  >("content");
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [deletedPages, setDeletedPages] = useState<PageSummary[]>([]);
  const [deletedPageTotal, setDeletedPageTotal] = useState(0);
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
  const [searchSnippets, setSearchSnippets] = useState<Map<
    string,
    string
  > | null>(null);
  const [searchRevision, setSearchRevision] = useState(0);
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
  const [trashDialogOpen, setTrashDialogOpen] = useState(false);
  const [trashSummary, setTrashSummary] = useState<TrashSummary | null>(null);
  const [trashConfirmation, setTrashConfirmation] = useState("");
  const [trashPending, setTrashPending] = useState(false);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashError, setTrashError] = useState<string | null>(null);
  const [siteVersion, setSiteVersion] = useState(1);
  const [writeMode, setWriteMode] = useState<"read_write" | "read_only">(
    "read_write",
  );
  const [writeModeReason, setWriteModeReason] = useState<string | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const viewRef = useRef(view);
  const queryRef = useRef(query);
  const capsRef = useRef(caps);
  const activeRef = useRef<Page | null>(null);
  const pagesRef = useRef<PageSummary[]>([]);
  const pageDetailsCacheRef = useRef(new Map<string, PageDetails>());
  const desiredPageIdRef = useRef<string | null>(null);
  const openPageRequestRef = useRef(0);
  const workspaceRequestRef = useRef(0);
  const graphRequestRef = useRef(0);
  const openPageAbortRef = useRef<AbortController | null>(null);
  const workspaceAbortRef = useRef<AbortController | null>(null);
  const pageSummaryAbortRef = useRef<AbortController | null>(null);
  const deletedPagesAbortRef = useRef<AbortController | null>(null);
  const knowledgeAbortRef = useRef<AbortController | null>(null);
  const neighborAbortRef = useRef<AbortController | null>(null);
  const attachmentAbortRef = useRef<AbortController | null>(null);
  const currentWikiIdRef = useRef<string | null>(null);
  const initialPermalinkRef = useRef<PagePermalinkTarget | null>(null);
  const permalinkReadRef = useRef(false);
  const replacePermalink = useCallback(
    (wikiId: string, pageId: string | null) => {
      const target = pageId
        ? buildPagePermalink(window.location.href, wikiId, pageId)
        : buildWikiPermalink(window.location.href, wikiId);
      if (target !== window.location.href)
        window.history.replaceState(null, "", target);
    },
    [],
  );
  const changeView = useCallback((nextView: WorkspaceView) => {
    // Keep asynchronous workspace hydration from restoring the document view
    // after the user has already navigated elsewhere in the same event turn.
    viewRef.current = nextView;
    setView(nextView);
    if (nextView === "document") setTreeMode("files");
    if (nextView === "knowledge") setTreeMode("knowledge");
  }, []);
  const clearPageSelection = useCallback(() => {
    openPageRequestRef.current++;
    openPageAbortRef.current?.abort();
    openPageAbortRef.current = null;
    desiredPageIdRef.current = null;
    activeRef.current = null;
    setActive(null);
    setMarkdown("");
    setRevisions([]);
    setNeighbors([]);
    setAttachments([]);
    setPendingPageId(null);
    pageDetailsCacheRef.current.clear();
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
    queryRef.current = query;
  }, [query]);
  useEffect(() => {
    capsRef.current = caps;
  }, [caps]);
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
  const pageSummary = useCallback((page: Page): PageSummary => {
    const { markdown, ...summary } = page;
    void markdown;
    return summary;
  }, []);
  const replacePageSnapshot = useCallback(
    (nextPage: Page) => {
      setPages((current) => {
        const summary = pageSummary(nextPage);
        const next = current.map((page) =>
          page.id === nextPage.id ? summary : page,
        );
        pagesRef.current = next;
        return next;
      });
    },
    [pageSummary],
  );

  const openPage = useCallback(
    async (
      pageId: string,
      preserveView = false,
      updatePermalink = !preserveView,
    ) => {
      if (
        preserveView &&
        desiredPageIdRef.current &&
        desiredPageIdRef.current !== pageId
      )
        return;
      if (!preserveView) desiredPageIdRef.current = pageId;
      const requestNumber = ++openPageRequestRef.current;
      openPageAbortRef.current?.abort();
      const controller = new AbortController();
      openPageAbortRef.current = controller;
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
      if (validCache) {
        const immediatePage = validCache.page;
        desiredPageIdRef.current = immediatePage.id;
        activeRef.current = immediatePage;
        setActive(immediatePage);
        setMarkdown(immediatePage.markdown);
        setRevisions(validCache.revisions);
        setNeighbors(validCache.neighbors);
        setAttachments(validCache.attachments);
        setStatus("status.verifyingLatest");
        setNotice(null);
      } else {
        if (snapshot) {
          const placeholder: Page = { ...snapshot, markdown: "" };
          activeRef.current = placeholder;
          setActive(placeholder);
          setMarkdown("");
          setRevisions([]);
          setNeighbors([]);
          setAttachments([]);
        }
        setStatus("status.syncingDetails");
      }
      if (updatePermalink && currentWikiIdRef.current)
        replacePermalink(currentWikiIdRef.current, pageId);

      try {
        const [
          { page },
          { revisions: history },
          { neighbors: linked },
          { attachments: files },
        ] = await Promise.all([
          api<{ page: Page }>(`/api/pages/${pageId}`, {
            signal: controller.signal,
          }),
          api<{ revisions: Revision[] }>(
            `/api/pages/${pageId}/revisions?limit=10`,
            { signal: controller.signal },
          ),
          api<{ neighbors: Neighbor[] }>(
            `/api/pages/${pageId}/neighbors?limit=20`,
            { signal: controller.signal },
          ),
          api<{ attachments: Attachment[] }>(
            `/api/attachments?page_id=${encodeURIComponent(pageId)}`,
            { signal: controller.signal },
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
        if (
          requestNumber !== openPageRequestRef.current ||
          controller.signal.aborted
        )
          return;
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
        if (openPageAbortRef.current === controller)
          openPageAbortRef.current = null;
      }
    },
    [changeView, replacePageSnapshot, replacePermalink, setStatus],
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
      workspaceAbortRef.current?.abort();
      const controller = new AbortController();
      workspaceAbortRef.current = controller;
      try {
        if (!permalinkReadRef.current) {
          initialPermalinkRef.current = readPagePermalink(window.location.href);
          permalinkReadRef.current = true;
        }
        const requestedTarget = initialPermalinkRef.current;
        let activePagesPromise = settleRequest(
          api<{ pages: PageSummary[] }>(
            "/api/pages?depth=64&limit=200&include_markdown=false",
            { signal: controller.signal },
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
        }>("/api/session/capabilities", { signal: controller.signal });
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
              signal: controller.signal,
            });
            activePagesPromise = settleRequest(
              api<{ pages: PageSummary[] }>(
                "/api/pages?depth=64&limit=200&include_markdown=false",
                { signal: controller.signal },
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
            }>("/api/session/capabilities", { signal: controller.signal });
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
          clearPageSelection();
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
          setDeletedPageTotal(0);
          setStatus(
            session.capabilities.can_bootstrap
              ? "status.setupRequired"
              : "status.readDenied",
          );
          return;
        }
        const [accessible, map] = await Promise.all([
          api<{ wikis: WikiSummary[] }>("/api/wikis", {
            signal: controller.signal,
          }),
          api<KnowledgeMapData>("/api/knowledge-map", {
            signal: controller.signal,
          }),
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
            void api<{ pages: PageSummary[]; total: number }>(
              "/api/pages?deleted=only&limit=100&include_markdown=false",
              { signal: controller.signal },
            ).then(
              ({ pages: deleted, total }) => {
                if (requestNumber === workspaceRequestRef.current) {
                  setDeletedPages(deleted);
                  setDeletedPageTotal(total);
                }
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
          if (target) void openPage(target, true, true);
        } else setStatus("status.listRefreshed");
      } catch (error) {
        if (
          requestNumber !== workspaceRequestRef.current ||
          controller.signal.aborted
        )
          return;
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
          setDeletedPageTotal(0);
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
      } finally {
        if (workspaceAbortRef.current === controller)
          workspaceAbortRef.current = null;
      }
    },
    [clearPageSelection, openPage, setStatus],
  );

  const refreshPageSummaries = useCallback(async () => {
    pageSummaryAbortRef.current?.abort();
    const controller = new AbortController();
    pageSummaryAbortRef.current = controller;
    try {
      const { pages: list } = await api<{ pages: PageSummary[] }>(
        "/api/pages?depth=64&limit=200&include_markdown=false",
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      pagesRef.current = list;
      for (const [pageId, cached] of pageDetailsCacheRef.current) {
        const listed = list.find((page) => page.id === pageId);
        if (!listed || listed.version !== cached.page.version)
          pageDetailsCacheRef.current.delete(pageId);
      }
      setPages(list);
      const current = activeRef.current;
      if (current && !list.some((page) => page.id === current.id)) {
        clearPageSelection();
        const fallback = list[0]?.id ?? null;
        if (currentWikiIdRef.current)
          replacePermalink(currentWikiIdRef.current, fallback);
        if (fallback) void openPage(fallback, true, false);
      }
    } catch {
      if (!controller.signal.aborted)
        console.warn("Workspace page summaries could not be synchronized.");
    } finally {
      if (pageSummaryAbortRef.current === controller)
        pageSummaryAbortRef.current = null;
    }
  }, [clearPageSelection, openPage, replacePermalink]);

  const refreshDeletedPages = useCallback(async () => {
    if (!capsRef.current.can_soft_delete) return;
    deletedPagesAbortRef.current?.abort();
    const controller = new AbortController();
    deletedPagesAbortRef.current = controller;
    try {
      const { pages: deleted, total } = await api<{
        pages: PageSummary[];
        total: number;
      }>("/api/pages?deleted=only&limit=100&include_markdown=false", {
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setDeletedPages(deleted);
        setDeletedPageTotal(total);
      }
    } catch {
      if (!controller.signal.aborted)
        console.warn("Deleted pages could not be synchronized.");
    } finally {
      if (deletedPagesAbortRef.current === controller)
        deletedPagesAbortRef.current = null;
    }
  }, []);

  const refreshKnowledgeMap = useCallback(async () => {
    knowledgeAbortRef.current?.abort();
    const controller = new AbortController();
    knowledgeAbortRef.current = controller;
    try {
      const map = await api<KnowledgeMapData>("/api/knowledge-map", {
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setKnowledgeMap(map);
    } catch {
      if (!controller.signal.aborted)
        console.warn("Knowledge map could not be synchronized.");
    } finally {
      if (knowledgeAbortRef.current === controller)
        knowledgeAbortRef.current = null;
    }
  }, []);

  const refreshActiveNeighbors = useCallback(async () => {
    const pageId = activeRef.current?.id;
    if (!pageId) return;
    neighborAbortRef.current?.abort();
    const controller = new AbortController();
    neighborAbortRef.current = controller;
    try {
      const { neighbors: linked } = await api<{ neighbors: Neighbor[] }>(
        `/api/pages/${pageId}/neighbors?limit=20`,
        { signal: controller.signal },
      );
      if (!controller.signal.aborted && activeRef.current?.id === pageId)
        setNeighbors(linked);
    } catch {
      if (!controller.signal.aborted)
        console.warn("Page neighbors could not be synchronized.");
    } finally {
      if (neighborAbortRef.current === controller)
        neighborAbortRef.current = null;
    }
  }, []);

  const refreshActiveAttachments = useCallback(async () => {
    const pageId = activeRef.current?.id;
    if (!pageId) return;
    attachmentAbortRef.current?.abort();
    const controller = new AbortController();
    attachmentAbortRef.current = controller;
    try {
      const { attachments: files } = await api<{
        attachments: Attachment[];
      }>(`/api/attachments?page_id=${encodeURIComponent(pageId)}`, {
        signal: controller.signal,
      });
      if (!controller.signal.aborted && activeRef.current?.id === pageId)
        setAttachments(files);
    } catch {
      if (!controller.signal.aborted)
        console.warn("Page attachments could not be synchronized.");
    } finally {
      if (attachmentAbortRef.current === controller)
        attachmentAbortRef.current = null;
    }
  }, []);

  const applyWorkspaceChange = useCallback(
    async (changeSet: ChangeSet) => {
      if (changeSet.session_changed) {
        await loadWorkspace(false);
        return;
      }
      if (changeSet.tree_changed) await refreshPageSummaries();
      const activeId = activeRef.current?.id ?? null;
      if (activeId && changeSet.pages_changed.includes(activeId))
        await openPage(activeId, true, false);
      else if (!changeSet.tree_changed) {
        const changedIds = changeSet.pages_changed.slice(0, 12);
        if (changeSet.pages_changed.length > changedIds.length)
          await refreshPageSummaries();
        else
          await Promise.all(
            changedIds.map(async (pageId) => {
              try {
                const { page } = await api<{ page: Page }>(
                  `/api/pages/${pageId}`,
                );
                replacePageSnapshot(page);
              } catch {
                // A tree-changing delete is handled by the summary refresh.
              }
            }),
          );
      }
      if (changeSet.links_changed && activeId) await refreshActiveNeighbors();
      if (activeId && changeSet.attachments_changed?.includes(activeId))
        await refreshActiveAttachments();
      if (changeSet.deleted_pages_changed) await refreshDeletedPages();
      if (changeSet.knowledge_changed) await refreshKnowledgeMap();
      if (changeSet.search_changed && queryRef.current.trim())
        setSearchRevision((value) => value + 1);
      if (changeSet.graph_changed) setGraph(null);
      setStatus("status.synced");
    },
    [
      loadWorkspace,
      openPage,
      refreshActiveAttachments,
      refreshActiveNeighbors,
      refreshDeletedPages,
      refreshKnowledgeMap,
      refreshPageSummaries,
      replacePageSnapshot,
      setStatus,
    ],
  );
  useEffect(() => {
    if (authRequired) return;
    let stop: (() => void) | undefined,
      disposed = false;
    if (!disposed)
      stop = startWorkspaceSyncController({
        getWikiId: () => currentWikiIdRef.current,
        loadInitial: () => loadWorkspace(),
        applyChange: applyWorkspaceChange,
      });
    return () => {
      disposed = true;
      stop?.();
    };
  }, [applyWorkspaceChange, authRequired, loadWorkspace]);
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
    } else {
      delete document.documentElement.dataset.pageId;
    }
  }, [active]);
  useEffect(() => {
    if (currentWiki) document.documentElement.dataset.wikiId = currentWiki.id;
    else delete document.documentElement.dataset.wikiId;
  }, [currentWiki]);
  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) return;
    let activeRequest = true;
    const timer = window.setTimeout(() => {
      void api<{
        results: Array<{ page_id: string; snippet: string }>;
      }>("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: normalized, limit: 20 }),
      })
        .then(({ results }) => {
          if (activeRequest)
            setSearchSnippets(
              new Map(
                results.map((result) => [result.page_id, result.snippet]),
              ),
            );
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
  }, [query, searchRevision]);

  const filtered = useMemo(
    () =>
      query.trim() && searchSnippets
        ? pages
            .filter((page) => searchSnippets.has(page.id))
            .map((page) => ({
              ...page,
              snippet: searchSnippets.get(page.id),
            }))
        : pages.map((page) => ({ ...page, snippet: undefined })),
    [pages, query, searchSnippets],
  );

  async function switchVault(wikiId: string) {
    if (!wikiId || wikiId === currentWiki?.id) return;
    try {
      setStatus("status.switchingWiki");
      graphRequestRef.current++;
      clearPageSelection();
      setDeletedPages([]);
      setDeletedPageTotal(0);
      setGraph(null);
      await mutateApi("/api/session/active-wiki", {
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
      clearPageSelection();
      setPages([]);
      setDeletedPages([]);
      setDeletedPageTotal(0);
      setGraph(null);
      await mutateApi("/api/wikis", {
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
      await mutateApi(`/api/wikis/${currentWiki.id}`, {
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

  async function openEmptyTrashDialog() {
    if (!caps.can_empty_trash || deletedPageTotal === 0) return;
    setTrashDialogOpen(true);
    setTrashLoading(true);
    setTrashSummary(null);
    setTrashConfirmation("");
    setTrashError(null);
    try {
      const summary = await api<TrashSummary>("/api/trash");
      setTrashSummary(summary);
      setDeletedPageTotal(summary.deleted_page_count);
    } catch (error) {
      setTrashError(
        error instanceof Error ? error.message : t("dialog.emptyTrashFailed"),
      );
    } finally {
      setTrashLoading(false);
    }
  }

  async function emptyCurrentTrash() {
    if (
      !caps.can_empty_trash ||
      !trashSummary?.trash_token ||
      trashPending ||
      trashConfirmation !== trashSummary.confirmation_phrase
    )
      return;
    setTrashPending(true);
    setTrashError(null);
    try {
      const { data, changeSet } = await mutateApi<EmptyTrashResult>(
        "/api/trash",
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            trash_token: trashSummary.trash_token,
            confirmation: trashConfirmation,
            operation_id: crypto.randomUUID(),
          }),
        },
      );
      setDeletedPages([]);
      setDeletedPageTotal(0);
      setTrashDialogOpen(false);
      setTrashSummary(null);
      setTrashConfirmation("");
      setStatus("status.trashEmptied", { count: data.purged_page_count });
      if (data.storage_cleanup_pending > 0)
        setNotice(
          t("dialog.emptyTrashCleanupPending", {
            count: data.storage_cleanup_pending,
          }),
        );
      const event = new CustomEvent("wiki:changed", { detail: changeSet });
      setTimeout(() => window.dispatchEvent(event), 0);
    } catch (error) {
      const code =
        error instanceof Error && "code" in error ? String(error.code) : null;
      setTrashError(
        error instanceof Error ? error.message : t("dialog.emptyTrashFailed"),
      );
      if (code === "version_conflict") {
        setTrashConfirmation("");
        try {
          const summary = await api<TrashSummary>("/api/trash");
          setTrashSummary(summary);
          setDeletedPageTotal(summary.deleted_page_count);
          await refreshDeletedPages();
        } catch {
          // Preserve the actionable conflict message when refresh also fails.
        }
      }
    } finally {
      setTrashPending(false);
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
    page: PageSummary,
    scope: "page" | "revision" | "deleted_page" = "page",
    restoreVersion?: number,
  ): ChangeRequestContext | null {
    if (!currentWiki) return null;
    return {
      language,
      wiki: { id: currentWiki.id, title: currentWiki.title },
      scope,
      webmcpPageUrl: buildWikiPermalink(window.location.href, currentWiki.id),
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
    page?: PageSummary;
    restoreVersion?: number;
    initialDetails?: string;
  }) {
    if (!requestsEnabled || !currentWiki) {
      setNotice(writeModeReason || t("request.unavailable"));
      return;
    }
    const webmcpPageUrl = buildWikiPermalink(
      window.location.href,
      currentWiki.id,
    );
    const contexts: ChangeRequestState["contexts"] = {
      wiki: {
        language,
        wiki: { id: currentWiki.id, title: currentWiki.title },
        scope: "wiki",
        webmcpPageUrl,
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
        webmcpPageUrl,
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
      return true;
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Codex 요청을 복사하지 못했습니다.",
      );
      return false;
    }
  }

  const linkedPages = useMemo(() => {
    if (!active) return [];
    return neighbors
      .map((item) =>
        item.source_page_id === active.id
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
      );
  }, [neighbors, active]);

  const visibleAttachments = active ? attachments : [];
  const visibleRevisions = active ? revisions : [];

  const breadcrumbPages = useMemo(() => {
    if (!active) return [];
    const byId = new Map(pages.map((page) => [page.id, page]));
    const trail: PageSummary[] = [active];
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
            onWorkspaceChanged={async () => {
              window.dispatchEvent(
                new CustomEvent("wiki:changed", { detail: null }),
              );
            }}
          />
        </Suspense>
      </main>
    );

  return (
    <main className="wiki-app">
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
                  deletedPageTotal={deletedPageTotal}
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
                  canEmptyTrash={caps.can_empty_trash}
                  onEmptyTrash={() => void openEmptyTrashDialog()}
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
                      onWorkspaceChanged={async () => {
                        window.dispatchEvent(
                          new CustomEvent("wiki:changed", { detail: null }),
                        );
                      }}
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

                  {active?.page_type === "source" && (
                    <section className="context-section source-section">
                      <div className="context-section-title">
                        <span>
                          <ExternalLink /> {t("page.originalSource")}
                        </span>
                      </div>
                      {active.source_url ? (
                        <>
                          <a
                            className="source-link-row"
                            href={active.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={active.source_url}
                          >
                            <ExternalLink />
                            <span>
                              <strong>
                                {sourceHostname(active.source_url)}
                              </strong>
                              <small>{t("page.openOriginalSource")}</small>
                            </span>
                          </a>
                          <dl className="source-metadata">
                            {active.retrieval_status && (
                              <div>
                                <dt>{t("page.retrievalStatus")}</dt>
                                <dd>
                                  {t(
                                    retrievalStatusKeys[
                                      active.retrieval_status
                                    ] ?? "page.retrievalUnknown",
                                  )}
                                </dd>
                              </div>
                            )}
                            {active.retrieved_at && (
                              <div>
                                <dt>{t("page.retrievedAt")}</dt>
                                <dd>
                                  {formatSourceDate(
                                    active.retrieved_at,
                                    language,
                                  )}
                                </dd>
                              </div>
                            )}
                            {active.extraction_method && (
                              <div>
                                <dt>{t("page.extractionMethod")}</dt>
                                <dd>{active.extraction_method}</dd>
                              </div>
                            )}
                            {active.confidence !== null && (
                              <div>
                                <dt>{t("page.sourceConfidence")}</dt>
                                <dd>{Math.round(active.confidence * 100)}%</dd>
                              </div>
                            )}
                          </dl>
                        </>
                      ) : (
                        <p className="context-empty">
                          {t("page.noOriginalSource")}
                        </p>
                      )}
                    </section>
                  )}

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
                          visibleAttachments.filter(
                            (item) => item.status === "ready",
                          ).length
                        }
                      </b>
                    </div>
                    <div className="context-list">
                      {visibleAttachments
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
                      {!visibleAttachments.some(
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
                      <b>{visibleRevisions.length}</b>
                    </div>
                    <ol className="revision-list">
                      {visibleRevisions.slice(0, 8).map((revision) => (
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
      {trashDialogOpen && (
        <WorkspaceDialog
          title={t("dialog.emptyTrashTitle")}
          description={t("dialog.emptyTrashDescription")}
          confirmLabel={
            trashPending
              ? t("dialog.emptyTrashPending")
              : t("dialog.emptyTrashAction")
          }
          confirmTone="destructive"
          confirmDisabled={
            trashLoading ||
            trashPending ||
            !trashSummary?.trash_token ||
            trashConfirmation !== trashSummary.confirmation_phrase
          }
          onConfirm={() => void emptyCurrentTrash()}
          onClose={() => {
            if (trashPending) return;
            setTrashDialogOpen(false);
            setTrashSummary(null);
            setTrashConfirmation("");
            setTrashError(null);
          }}
        >
          {trashLoading ? (
            <p role="status">{t("dialog.emptyTrashLoading")}</p>
          ) : trashSummary ? (
            <>
              <div className="trash-impact-grid">
                <div>
                  <strong>{trashSummary.deleted_page_count}</strong>
                  <small>{t("dialog.emptyTrashPages")}</small>
                </div>
                <div>
                  <strong>{trashSummary.revision_count}</strong>
                  <small>{t("dialog.emptyTrashRevisions")}</small>
                </div>
                <div>
                  <strong>{trashSummary.claim_count}</strong>
                  <small>{t("dialog.emptyTrashClaims")}</small>
                </div>
                <div>
                  <strong>{trashSummary.attachment_count}</strong>
                  <small>{t("dialog.emptyTrashAttachments")}</small>
                </div>
              </div>
              <p className="workspace-dialog-warning">
                {t("dialog.emptyTrashImpact", {
                  size: compactBytes(trashSummary.estimated_bytes, language),
                })}
              </p>
              <div className="workspace-dialog-confirmation">
                <span>{t("dialog.confirmationPhrase")}</span>
                <code>{trashSummary.confirmation_phrase}</code>
              </div>
              <label className="workspace-dialog-field">
                <span>{t("dialog.confirmation")}</span>
                <input
                  autoFocus
                  value={trashConfirmation}
                  onChange={(event) => setTrashConfirmation(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      trashConfirmation === trashSummary.confirmation_phrase &&
                      !trashPending
                    )
                      void emptyCurrentTrash();
                  }}
                  placeholder={trashSummary.confirmation_phrase}
                  autoComplete="off"
                />
              </label>
            </>
          ) : null}
          {trashError && (
            <p className="workspace-dialog-error" role="alert">
              {trashError}
            </p>
          )}
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
