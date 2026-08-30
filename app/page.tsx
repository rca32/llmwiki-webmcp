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
  FileText,
  Link2,
  Moon,
  Move,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  RotateCcw,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
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
  return (
    <div className="workspace-loading" role="status" aria-live="polite">
      작업공간 불러오는 중
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

const welcomeMarkdown = `# WebMCP Native Wiki

사람과 에이전트가 **같은 지식 공간**을 함께 편집합니다.

## 오늘의 초점

- UI와 WebMCP는 같은 서버 명령을 사용합니다.
- 모든 쓰기는 \`expected_version\`으로 충돌을 감지합니다.
- 확정된 변경은 리비전으로 남고 언제든 복구할 수 있습니다.

> 이 페이지는 열린 브라우저 세션의 권한을 그대로 사용합니다.

관련 문서: [[아키텍처]] · [[도구 계약]] · [[운영과 복구]]`;

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

export default function Home() {
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [view, setView] = useState<WorkspaceView>("document");
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
  const [caps, setCaps] = useState<Caps>({
    can_bootstrap: false,
    can_read: false,
    can_write: false,
    can_restore: false,
    can_soft_delete: false,
    can_manage_attachments: false,
    can_export_portable: false,
    can_manage_members: false,
    can_full_backup: false,
    can_import: false,
  });
  const [siteVersion, setSiteVersion] = useState(1);
  const [writeMode, setWriteMode] = useState<"read_write" | "read_only">(
    "read_write",
  );
  const [writeModeReason, setWriteModeReason] = useState<string | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
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
  const defaultPageCreationRef = useRef<Promise<unknown> | null>(null);
  const dirtyRef = useRef(false);
  const markdownRef = useRef("");
  const autosavePausedRef = useRef(false);
  const dirty = markdown !== savedMarkdown;
  useEffect(() => {
    const storedTheme = window.localStorage.getItem("liminal-wiki:theme");
    const shouldUseDark =
      storedTheme === "dark" ||
      (!storedTheme &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
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

      if (!preserveDraft) setView("document");
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
    [replacePageSnapshot, updateAutosavePaused],
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
        const activePagesPromise = settleRequest(
          api<{ pages: Page[] }>("/api/pages?depth=64&limit=200"),
        );
        const session = await api<{
          wiki: { id: string; title: string; role: string } | null;
          capabilities: Caps;
          site_version: number;
          write_mode: "read_write" | "read_only";
          write_mode_reason: string | null;
        }>("/api/session/capabilities");
        if (requestNumber !== workspaceRequestRef.current) return;
        setCaps(session.capabilities);
        setSiteVersion(session.site_version);
        setWriteMode(session.write_mode);
        setWriteModeReason(session.write_mode_reason);
        setSessionLoaded(true);
        if (!session.capabilities.can_read) {
          setPages([]);
          setDeletedPages([]);
          setStatus(
            session.capabilities.can_bootstrap
              ? "초기 설정 필요"
              : "읽기 권한 없음",
          );
          return;
        }
        const activePagesRequest = await activePagesPromise;
        if ("error" in activePagesRequest) throw activePagesRequest.error;
        let list = activePagesRequest.data.pages;
        if (requestNumber !== workspaceRequestRef.current) return;
        if (!list.length && session.capabilities.can_write) {
          defaultPageCreationRef.current ??= api("/api/pages", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              title: "WebMCP Native Wiki",
              page_type: "concept",
              markdown: welcomeMarkdown,
              parent_id: null,
              operation_id: crypto.randomUUID(),
            }),
          }).finally(() => {
            defaultPageCreationRef.current = null;
          });
          await defaultPageCreationRef.current;
          if (requestNumber !== workspaceRequestRef.current) return;
          list = (await api<{ pages: Page[] }>("/api/pages?depth=64&limit=200"))
            .pages;
          if (requestNumber !== workspaceRequestRef.current) return;
        }
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
              "/api/pages?deleted=only&limit=100",
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
          const target =
            current && list.some((page) => page.id === current.id)
              ? current.id
              : list[0]?.id;
          if (target) void openPage(target, true);
        } else setStatus("목록 갱신됨");
      } catch (error) {
        if (requestNumber !== workspaceRequestRef.current) return;
        setSessionLoaded(true);
        setStatus("연결 실패");
        setNotice(
          error instanceof Error
            ? error.message
            : "위키를 불러오지 못했습니다.",
        );
      }
    },
    [openPage],
  );

  useEffect(() => {
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
  }, [loadWorkspace]);
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "k") {
        event.preventDefault();
        setView("search");
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
  }, [caps.can_write, view]);
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
    if (active) document.documentElement.dataset.pageId = active.id;
    else delete document.documentElement.dataset.pageId;
  }, [active]);
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

  async function createNewPage() {
    if (!caps.can_write) return;
    const title = window.prompt("새 페이지 제목");
    if (!title?.trim()) return;
    try {
      const created = await api<{ page_id: string }>("/api/pages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          page_type: "note",
          markdown: `# ${title.trim()}\n\n`,
          parent_id: null,
          operation_id: crypto.randomUUID(),
        }),
      });
      await loadWorkspace(false);
      await openPage(created.page_id);
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

  async function moveActivePage() {
    if (!active || !caps.can_write || dirty) return;
    const destination = window.prompt(
      "새 부모 페이지 제목을 입력하세요. 루트로 이동하려면 / 를 입력하세요.",
      "/",
    );
    if (destination === null) return;
    const parentId =
      destination.trim() === "/"
        ? null
        : pages.find(
            (page) =>
              page.title.toLowerCase() === destination.trim().toLowerCase(),
          )?.id;
    if (destination.trim() !== "/" && !parentId) {
      setNotice("해당 제목의 활성 페이지를 찾지 못했습니다.");
      return;
    }
    try {
      await api(`/api/pages/${active.id}/move`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expected_version: active.version,
          parent_id: parentId,
          sort_order: 0,
          operation_id: crypto.randomUUID(),
        }),
      });
      await loadWorkspace(true);
      setStatus("페이지를 이동했습니다.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "페이지를 이동하지 못했습니다.",
      );
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
    setView("graph");
    setGraphLoading(true);
    try {
      setGraph(await api<Graph>("/api/graph?limit=2000"));
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

  if (sessionLoaded && !caps.can_read)
    return (
      <main className="wiki-shell bootstrap-shell-root">
        <SiteTools key={`${writeMode}-${caps.can_write}`} />
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
      <SiteTools key={writeMode + "-" + String(caps.can_write)} />
      <IconSidebar
        activeView={view}
        leftPanelOpen={leftPanelOpen}
        onToggleLeftPanel={() => setLeftPanelOpen((value) => !value)}
        onViewChange={(nextView) => {
          if (nextView === "graph") void showGraph();
          else setView(nextView);
        }}
      />
      <div className="app-workspace">
        <ResizablePanelGroup direction="horizontal">
          {leftPanelOpen && (
            <>
              <ResizablePanel
                id="knowledge-tree"
                defaultSize="20%"
                minSize="14%"
                maxSize="34%"
              >
                <KnowledgeTree
                  pages={filtered}
                  deletedPages={deletedPages}
                  activePageId={pendingPageId ?? active?.id ?? null}
                  pendingPageId={pendingPageId}
                  query={query}
                  canWrite={caps.can_write}
                  onQueryChange={setQuery}
                  onOpenPage={(pageId) => void openPage(pageId)}
                  onCreatePage={() => void createNewPage()}
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

          <ResizablePanel id="wiki-content" minSize="38%">
            <section className="workspace-main">
              <header className="workspace-topbar">
                <div className="workspace-breadcrumbs">
                  {!leftPanelOpen && (
                    <button
                      type="button"
                      className="topbar-icon-button"
                      onClick={() => setLeftPanelOpen(true)}
                      aria-label="사이드바 열기"
                    >
                      <ChevronRight />
                    </button>
                  )}
                  <span>Liminal Wiki</span>
                  <ChevronRight />
                  <strong>
                    {view === "operations"
                      ? "운영과 복구"
                      : view === "graph"
                        ? "Knowledge graph"
                        : view === "search"
                          ? "Search"
                          : (active?.title ?? "불러오는 중")}
                  </strong>
                </div>
                <div className="workspace-actions">
                  {writeMode === "read_only" && (
                    <span
                      className="readonly-badge"
                      title={
                        writeModeReason ?? "운영자가 쓰기를 일시 중지했습니다."
                      }
                    >
                      읽기 전용
                    </span>
                  )}
                  <span className={"sync-state " + (dirty ? "dirty" : "")}>
                    <i />
                    {dirty ? "저장되지 않은 변경" : status}
                  </span>
                  <button
                    type="button"
                    className="topbar-icon-button"
                    onClick={() => {
                      const next =
                        !document.documentElement.classList.contains("dark");
                      setDarkMode(next);
                      document.documentElement.classList.toggle("dark", next);
                      window.localStorage.setItem(
                        "liminal-wiki:theme",
                        next ? "dark" : "light",
                      );
                    }}
                    aria-label={darkMode ? "라이트 테마" : "다크 테마"}
                    title={darkMode ? "라이트 테마" : "다크 테마"}
                  >
                    {darkMode ? <Sun /> : <Moon />}
                  </button>
                  {view === "document" && (
                    <button
                      type="button"
                      className="topbar-icon-button"
                      onClick={() => setRightPanelOpen((value) => !value)}
                      aria-label={
                        rightPanelOpen ? "상세 패널 닫기" : "상세 패널 열기"
                      }
                      title={
                        rightPanelOpen ? "상세 패널 닫기" : "상세 패널 열기"
                      }
                    >
                      {rightPanelOpen ? (
                        <PanelRightClose />
                      ) : (
                        <PanelRightOpen />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    className="topbar-text-button"
                    onClick={() => setView("operations")}
                    disabled={!caps.can_export_portable}
                  >
                    백업
                  </button>
                  <button
                    type="button"
                    className="workspace-avatar"
                    aria-label="사용자 프로필"
                  >
                    DH
                  </button>
                </div>
              </header>

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
                          <button
                            type="button"
                            className="editor-icon-action"
                            onClick={() => void moveActivePage()}
                            disabled={!active || dirty || !caps.can_write}
                            title="페이지 이동"
                            aria-label="페이지 이동"
                          >
                            <Move />
                          </button>
                          <button
                            type="button"
                            className="editor-icon-action destructive"
                            onClick={() => void deleteActivePage()}
                            disabled={!active || dirty || !caps.can_soft_delete}
                            title="페이지 삭제"
                            aria-label="페이지 삭제"
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
                                aria-label="알림 닫기"
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
                defaultSize="22%"
                minSize="18%"
                maxSize="36%"
              >
                <aside className="context-panel">
                  <header className="context-panel-header">
                    <div>
                      <strong>Page details</strong>
                      <span>{active?.page_type ?? "wiki page"}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRightPanelOpen(false)}
                      aria-label="상세 패널 닫기"
                    >
                      <PanelRightClose />
                    </button>
                  </header>

                  <section className="context-section">
                    <div className="context-section-title">
                      <span>
                        <Link2 /> Linked mentions
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
                                  ? "Outgoing link"
                                  : "Backlink"}
                              </small>
                            </span>
                            <ChevronRight />
                          </button>
                        ))
                      ) : (
                        <p className="context-empty">
                          연결된 페이지가 없습니다.
                        </p>
                      )}
                    </div>
                  </section>

                  <section className="context-section">
                    <div className="context-section-title">
                      <span>
                        <Paperclip /> Attachments
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
                        <Upload /> 파일 추가
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
                        <p className="context-empty">첨부파일이 없습니다.</p>
                      )}
                    </div>
                  </section>

                  <section className="context-section revision-section">
                    <div className="context-section-title">
                      <span>
                        <Clock3 /> Version history
                      </span>
                      <b>{revisions.length}</b>
                    </div>
                    <ol className="revision-list">
                      {revisions.slice(0, 8).map((revision) => (
                        <li key={revision.version}>
                          <i />
                          <div>
                            <strong>
                              {revision.change_summary ?? "페이지 변경"}
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
                                  이 버전 복구
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
    </main>
  );
}
