"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SiteTools } from "./site-tools";
import { OperationsPanel } from "./operations-panel";
import { MarkdownPreview } from "./markdown-preview";

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
  const [view, setView] = useState<"document" | "graph" | "operations">(
    "document",
  );
  const [pages, setPages] = useState<Page[]>([]);
  const [deletedPages, setDeletedPages] = useState<Page[]>([]);
  const [active, setActive] = useState<Page | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [savedMarkdown, setSavedMarkdown] = useState("");
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [neighbors, setNeighbors] = useState<Neighbor[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [graph, setGraph] = useState<Graph | null>(null);
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
  const desiredPageIdRef = useRef<string | null>(null);
  const openPageRequestRef = useRef(0);
  const dirtyRef = useRef(false);
  const markdownRef = useRef("");
  const autosavePausedRef = useRef(false);
  const dirty = markdown !== savedMarkdown;
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
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
      setView("document");
      const protectedDraft = dirtyRef.current || autosavePausedRef.current;
      if (protectedDraft && (preserveDraft || activeRef.current?.id === pageId))
        return;
      desiredPageIdRef.current = page.id;
      activeRef.current = page;
      setActive(page);
      setMarkdown(page.markdown);
      setSavedMarkdown(page.markdown);
      setRevisions(history);
      setNeighbors(linked);
      setAttachments(files);
      setStatus("동기화됨");
      setNotice(null);
      setEditConflict(null);
      updateAutosavePaused(false);
    },
    [updateAutosavePaused],
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
      try {
        const session = await api<{
          wiki: { id: string; title: string; role: string } | null;
          capabilities: Caps;
          site_version: number;
          write_mode: "read_write" | "read_only";
          write_mode_reason: string | null;
        }>("/api/session/capabilities");
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
        let list = (
          await api<{ pages: Page[] }>("/api/pages?depth=64&limit=200")
        ).pages;
        if (!list.length && session.capabilities.can_write) {
          await api("/api/pages", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              title: "WebMCP Native Wiki",
              page_type: "concept",
              markdown: welcomeMarkdown,
              parent_id: null,
              operation_id: crypto.randomUUID(),
            }),
          });
          list = (await api<{ pages: Page[] }>("/api/pages?depth=64&limit=200"))
            .pages;
        }
        setPages(list);
        if (session.capabilities.can_soft_delete)
          setDeletedPages(
            (await api<{ pages: Page[] }>("/api/pages?deleted=only&limit=100"))
              .pages,
          );
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
          if (target) await openPage(target, true);
        } else setStatus("목록 갱신됨");
      } catch (error) {
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
        document.querySelector<HTMLInputElement>(".search-box input")?.focus();
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
            setActive((current) =>
              current?.id === pageId
                ? { ...current, version: result.version, markdown: draft }
                : current,
            );
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
      setActive({ ...active, markdown, version: result.version });
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
    setActive(editConflict.latest);
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
    try {
      setGraph(await api<Graph>("/api/graph?limit=2000"));
      setView("graph");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "그래프를 불러오지 못했습니다.",
      );
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
        <OperationsPanel
          capabilities={caps}
          siteVersion={siteVersion}
          hasWiki={false}
          writeMode={writeMode}
          writeModeReason={writeModeReason}
          onWorkspaceChanged={() => loadWorkspace(true)}
        />
      </main>
    );

  return (
    <main className="wiki-shell">
      <SiteTools key={`${writeMode}-${caps.can_write}`} />
      <aside className="icon-rail" aria-label="주요 메뉴">
        <div className="brand-mark" aria-label="Liminal Wiki">
          LW
        </div>
        <nav>
          <button
            className={`rail-button ${view === "document" ? "active" : ""}`}
            aria-label="문서"
            onClick={() => setView("document")}
          >
            ▤
          </button>
          <button
            className="rail-button"
            aria-label="검색"
            onClick={() =>
              document
                .querySelector<HTMLInputElement>(".search-box input")
                ?.focus()
            }
          >
            ⌕
          </button>
          <button
            className={`rail-button ${view === "graph" ? "active" : ""}`}
            aria-label="그래프"
            onClick={() => void showGraph()}
          >
            ⌬
          </button>
        </nav>
        <button
          className={`rail-button rail-bottom ${view === "operations" ? "active" : ""}`}
          aria-label="운영과 복구"
          onClick={() => setView("operations")}
        >
          ⚙
        </button>
      </aside>
      <aside className="knowledge-panel">
        <div className="workspace-heading">
          <div>
            <p className="eyebrow">PERSONAL KNOWLEDGE</p>
            <h1>Liminal Wiki</h1>
          </div>
          <button
            className="square-button"
            aria-label="새 페이지"
            onClick={createNewPage}
            disabled={!caps.can_write}
          >
            ＋
          </button>
        </div>
        <label className="search-box">
          <span>⌕</span>
          <input
            aria-label="지식 검색"
            aria-keyshortcuts="Control+K Meta+K"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="지식 검색"
          />
          <kbd>⌘K</kbd>
        </label>
        <div className="panel-section-heading">
          <span>페이지</span>
          <span>{filtered.length}</span>
        </div>
        <nav className="page-tree" aria-label="페이지 트리">
          {filtered.map((page, index) => (
            <button
              className={`tree-item ${active?.id === page.id ? "active" : ""}`}
              style={{
                paddingLeft:
                  9 + Math.max(0, page.path.split("/").length - 2) * 14,
              }}
              key={page.id}
              onClick={() => void openPage(page.id)}
              onKeyDown={(event) => {
                if (
                  !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
                )
                  return;
                event.preventDefault();
                const items = Array.from(
                  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                    ":scope > .tree-item",
                  ) ?? [],
                );
                const nextIndex =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? items.length - 1
                      : event.key === "ArrowDown"
                        ? Math.min(index + 1, items.length - 1)
                        : Math.max(index - 1, 0);
                items[nextIndex]?.focus();
              }}
            >
              <span className="tree-glyph">
                {page.page_type === "concept" ? "◇" : "·"}
              </span>
              <span>
                <strong>{page.title}</strong>
                <small>
                  {page.page_type} · v{page.version}
                </small>
              </span>
            </button>
          ))}
        </nav>
        {deletedPages.length > 0 && (
          <details className="trash-list">
            <summary>
              휴지통 <span>{deletedPages.length}</span>
            </summary>
            {deletedPages.map((page) => (
              <button key={page.id} onClick={() => void restoreDeleted(page)}>
                <span>{page.title}</span>
                <small>v{page.version} · 복구</small>
              </button>
            ))}
          </details>
        )}
        <div className="agent-card">
          <div className="agent-pulse">
            <span />
          </div>
          <div>
            <strong>
              Site tools {caps.can_write ? "읽기·쓰기" : "읽기"} 준비
            </strong>
            <p>열린 페이지의 세션 권한 사용</p>
          </div>
          <span className="agent-count">{caps.can_write ? "12" : "06"}</span>
        </div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Liminal Wiki</span>
            <b>/</b>
            <strong>
              {view === "operations"
                ? "운영과 복구"
                : (active?.title ?? "불러오는 중")}
            </strong>
          </div>
          <div className="top-actions">
            {writeMode === "read_only" && (
              <span
                className="readonly-badge"
                title={writeModeReason ?? "운영자가 쓰기를 일시 중지했습니다."}
              >
                읽기 전용
              </span>
            )}
            <span className={`sync-state ${dirty ? "dirty" : ""}`}>
              <i />
              {dirty ? "저장되지 않은 변경" : status}
            </span>
            <button
              className="ghost-button"
              onClick={() => setView("operations")}
              disabled={!caps.can_export_portable}
            >
              백업
            </button>
            <button className="avatar" aria-label="사용자 프로필">
              DH
            </button>
          </div>
        </header>
        {view === "operations" ? (
          <OperationsPanel
            capabilities={caps}
            siteVersion={siteVersion}
            hasWiki
            writeMode={writeMode}
            writeModeReason={writeModeReason}
            onWorkspaceChanged={() => loadWorkspace(true)}
          />
        ) : view === "graph" ? (
          <div className="graph-stage">
            <header>
              <div>
                <span>KNOWLEDGE GRAPH</span>
                <h2>페이지 연결 지도</h2>
                <p>
                  {graph?.nodes.length ?? 0}개 노드 · {graph?.edges.length ?? 0}
                  개 연결
                </p>
              </div>
              <button onClick={() => void showGraph()}>새로 고침</button>
            </header>
            <div className="graph-grid">
              {graph?.nodes.map((node) => (
                <button
                  key={node.id}
                  className={`graph-node type-${node.page_type}`}
                  onClick={() => void openPage(node.id)}
                >
                  <strong>{node.title}</strong>
                  <small>
                    {node.page_type} · v{node.version}
                  </small>
                  <span>
                    {
                      graph.edges.filter(
                        (edge) =>
                          edge.source === node.id || edge.target === node.id,
                      ).length
                    }{" "}
                    links
                  </span>
                </button>
              ))}
            </div>
            {graph?.truncated && (
              <p className="graph-warning">
                노드 한도에 도달해 일부 결과가 생략되었습니다.
              </p>
            )}
          </div>
        ) : (
          <div className="document-stage">
            <article className="editor-card">
              <div className="document-meta">
                <span className="document-kicker">
                  {active?.page_type?.toUpperCase() ?? "WIKI PAGE"}
                </span>
                <div className="meta-actions">
                  <button
                    onClick={() => void moveActivePage()}
                    disabled={!active || dirty || !caps.can_write}
                  >
                    이동
                  </button>
                  <button
                    className="danger"
                    onClick={() => void deleteActivePage()}
                    disabled={!active || dirty || !caps.can_soft_delete}
                  >
                    삭제
                  </button>
                  <div
                    className="mode-switch"
                    role="group"
                    aria-label="편집 모드"
                  >
                    <button
                      className={mode === "edit" ? "active" : ""}
                      onClick={() => setMode("edit")}
                      aria-keyshortcuts="Control+Shift+E Meta+Shift+E"
                    >
                      편집
                    </button>
                    <button
                      className={mode === "preview" ? "active" : ""}
                      onClick={() => setMode("preview")}
                    >
                      미리보기
                    </button>
                  </div>
                </div>
              </div>
              {notice && (
                <div className="conflict-banner" role="alert">
                  {notice}
                  <button
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
                      읽은 버전 {editConflict.baseVersion} · 최신 버전{" "}
                      {editConflict.latest.version}
                    </small>
                  </header>
                  <div className="conflict-columns">
                    <label>
                      <span>최신 버전</span>
                      <textarea readOnly value={editConflict.latest.markdown} />
                    </label>
                    <label>
                      <span>내 초안</span>
                      <textarea readOnly value={editConflict.draft} />
                    </label>
                    <label>
                      <span>줄 단위 diff</span>
                      <pre>{editConflict.diff}</pre>
                    </label>
                  </div>
                  <div className="conflict-actions">
                    <button onClick={beginConflictMerge}>
                      병합 초안 만들기
                    </button>
                    <button onClick={() => void saveConflictAsNewPage()}>
                      내 초안을 새 페이지로 저장
                    </button>
                  </div>
                  <p>
                    병합 초안의 충돌 표식을 직접 정리한 뒤 “변경 저장”을
                    누르세요. 자동 저장은 그때까지 일시 중지됩니다.
                  </p>
                </section>
              )}
              {mode === "edit" ? (
                <textarea
                  className="markdown-editor"
                  aria-label="Markdown 편집기"
                  spellCheck={false}
                  value={markdown}
                  readOnly={!caps.can_write}
                  onChange={(event) => {
                    const nextMarkdown = event.target.value;
                    markdownRef.current = nextMarkdown;
                    dirtyRef.current = nextMarkdown !== savedMarkdown;
                    setMarkdown(nextMarkdown);
                  }}
                />
              ) : (
                <MarkdownPreview value={markdown} onWikiLink={openWikiLink} />
              )}
              <footer className="editor-footer">
                <div>
                  <span>Markdown</span>
                  <span>{markdown.length}자</span>
                  <span>version {active?.version ?? "—"}</span>
                </div>
                <div className="editor-actions">
                  {mode === "edit" && caps.can_write && (
                    <button
                      className="autosave-toggle"
                      aria-pressed={autosavePaused}
                      onClick={() =>
                        updateAutosavePaused(!autosavePausedRef.current)
                      }
                    >
                      {autosavePaused
                        ? "자동 저장 재개"
                        : "자동 저장 일시 중지"}
                    </button>
                  )}
                  <button
                    className="save-button"
                    disabled={
                      !dirty || !caps.can_write || Boolean(editConflict)
                    }
                    onClick={() => void save()}
                  >
                    {dirty ? "변경 저장" : "저장 완료"}
                  </button>
                </div>
              </footer>
            </article>
            <aside className="context-panel">
              <section>
                <div className="context-title">
                  <span>연결된 지식</span>
                  <b>{linkedPages.length}</b>
                </div>
                {linkedPages.length ? (
                  linkedPages.map((item, index) => (
                    <button
                      className="linked-note"
                      key={item.id!}
                      onClick={() => void openPage(item.id!)}
                    >
                      <i
                        className={
                          index % 3 === 0
                            ? "coral"
                            : index % 3 === 1
                              ? "lime"
                              : "blue"
                        }
                      />
                      <span>
                        <strong>{item.title}</strong>
                        <small>
                          {item.direction === "out"
                            ? "이 페이지에서 연결"
                            : "이 페이지를 참조"}
                        </small>
                      </span>
                      <b>↗</b>
                    </button>
                  ))
                ) : (
                  <p className="empty-context">
                    아직 연결된 페이지가 없습니다.
                  </p>
                )}
              </section>
              <section className="attachment-section">
                <div className="context-title">
                  <span>첨부파일</span>
                  <b>
                    {
                      attachments.filter((item) => item.status === "ready")
                        .length
                    }
                  </b>
                </div>
                {caps.can_manage_attachments && (
                  <label className="upload-button">
                    파일 추가
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
                <div className="attachment-list">
                  {attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className={attachment.status !== "ready" ? "deleted" : ""}
                    >
                      <span>
                        <a
                          href={
                            attachment.status === "ready"
                              ? `/api/attachments/${attachment.id}`
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
                            onClick={() => void deleteAttachment(attachment)}
                          >
                            삭제
                          </button>
                        ) : (
                          <button
                            onClick={() => void restoreAttachment(attachment)}
                          >
                            복구
                          </button>
                        ))}
                    </div>
                  ))}
                </div>
              </section>
              <section className="revision-section">
                <div className="context-title">
                  <span>최근 리비전</span>
                  <span>{revisions.length}</span>
                </div>
                <ol className="timeline">
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
                              className="restore-revision"
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
              <section className="safety-note">
                <span>VERSION GUARD</span>
                <strong>덮어쓰기 전에 최신 버전을 확인합니다.</strong>
                <p>
                  사람과 에이전트의 동시 편집은 충돌 결과로 안전하게 멈춥니다.
                </p>
              </section>
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}
