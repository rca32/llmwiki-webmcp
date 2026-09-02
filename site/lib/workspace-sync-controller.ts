import type { ChangeSet } from "./contracts";
import {
  FULL_CLIENT_CHANGE_SET,
  clientChangeSetHasWork,
  mergeClientChangeSets,
  normalizeClientChangeSet,
} from "./workspace-client-sync";

type SyncResponse = {
  wiki_id: string;
  cursor: string | null;
  change_set: ChangeSet;
  attachments_changed: string[];
  deleted_pages_changed: boolean;
  session_changed: boolean;
  full_resync_required: boolean;
};

type SyncEnvelope =
  | { ok: true; data: SyncResponse }
  | { ok: false; error: { message: string } };

export type WorkspaceSyncControllerOptions = {
  getWikiId: () => string | null;
  loadInitial: () => Promise<void>;
  applyChange: (changeSet: ChangeSet) => Promise<void>;
};

export function startWorkspaceSyncController(
  options: WorkspaceSyncControllerOptions,
): () => void {
  const tabId = crypto.randomUUID();
  let stopped = false,
    cursor: string | null = null,
    cursorWikiId: string | null = null,
    inFlight = false,
    lastCompletedAt = 0,
    retryIndex = 0,
    retryTimer: number | null = null,
    pending: ChangeSet | null = null,
    pendingTimer: number | null = null,
    applying = false,
    syncController: AbortController | null = null;
  const channel =
    typeof BroadcastChannel === "function"
      ? new BroadcastChannel("liminal-wiki:workspace-change")
      : null;

  const flush = () => {
    if (stopped || applying || !pending) return;
    const changeSet = pending;
    pending = null;
    applying = true;
    void options.applyChange(changeSet).finally(() => {
      applying = false;
      if (pending) flush();
    });
  };

  const enqueue = (value: unknown, broadcast = false) => {
    const changeSet = normalizeClientChangeSet(value);
    pending = mergeClientChangeSets(pending, changeSet);
    if (broadcast) {
      const message = {
        wiki_id: document.documentElement.dataset.wikiId ?? options.getWikiId(),
        source_tab_id: tabId,
        change_set: changeSet,
      };
      channel?.postMessage(message);
      try {
        window.localStorage.setItem(
          "liminal-wiki:workspace-change",
          JSON.stringify({ ...message, nonce: crypto.randomUUID() }),
        );
      } catch {
        // BroadcastChannel remains the primary same-browser transport.
      }
    }
    if (pendingTimer !== null) return;
    pendingTimer = window.setTimeout(() => {
      pendingTimer = null;
      flush();
    }, 50);
  };

  const scheduleRetry = () => {
    const delays = [5_000, 10_000, 30_000],
      delay = delays[Math.min(retryIndex, delays.length - 1)];
    retryIndex++;
    if (retryTimer !== null) window.clearTimeout(retryTimer);
    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      void runSync();
    }, delay);
  };

  const runSync = async () => {
    const wikiId = options.getWikiId();
    if (
      stopped ||
      !wikiId ||
      inFlight ||
      document.visibilityState !== "visible"
    )
      return;
    if (cursorWikiId !== wikiId) {
      cursor = null;
      cursorWikiId = wikiId;
    }
    inFlight = true;
    syncController?.abort();
    const controller = new AbortController();
    syncController = controller;
    try {
      const path = cursor
          ? `/api/sync?cursor=${encodeURIComponent(cursor)}`
          : "/api/sync",
        response = await fetch(path, {
          credentials: "same-origin",
          signal: controller.signal,
        }),
        envelope = (await response.json()) as SyncEnvelope;
      if (!response.ok || !envelope.ok)
        throw new Error(
          envelope.ok
            ? `Sync failed (${response.status})`
            : envelope.error.message,
        );
      const delta = envelope.data;
      if (controller.signal.aborted || delta.wiki_id !== options.getWikiId())
        return;
      cursor = delta.cursor;
      lastCompletedAt = Date.now();
      retryIndex = 0;
      const changeSet = delta.full_resync_required
        ? FULL_CLIENT_CHANGE_SET
        : normalizeClientChangeSet({
            ...delta.change_set,
            attachments_changed: delta.attachments_changed,
            deleted_pages_changed: delta.deleted_pages_changed,
            session_changed: delta.session_changed,
          });
      if (clientChangeSetHasWork(changeSet)) enqueue(changeSet);
    } catch {
      if (!controller.signal.aborted) scheduleRetry();
    } finally {
      if (syncController === controller) syncController = null;
      inFlight = false;
    }
  };

  const receive = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const message = value as Record<string, unknown>;
    if (
      message.source_tab_id === tabId ||
      message.wiki_id !== options.getWikiId()
    )
      return;
    enqueue(message.change_set);
  };
  const onChange = (event: Event) =>
    enqueue((event as CustomEvent).detail, true);
  const onFocus = () => {
    if (Date.now() - lastCompletedAt >= 5_000) void runSync();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== "liminal-wiki:workspace-change" || !event.newValue)
      return;
    try {
      receive(JSON.parse(event.newValue));
    } catch {
      // Ignore malformed device-local signals.
    }
  };
  if (channel) channel.onmessage = (event) => receive(event.data);
  window.addEventListener("wiki:changed", onChange);
  window.addEventListener("focus", onFocus);
  window.addEventListener("storage", onStorage);
  const poll = window.setInterval(() => {
    if (document.visibilityState === "visible") void runSync();
  }, 30_000);
  void options.loadInitial().then(() => runSync());

  return () => {
    stopped = true;
    window.clearInterval(poll);
    if (pendingTimer !== null) window.clearTimeout(pendingTimer);
    if (retryTimer !== null) window.clearTimeout(retryTimer);
    syncController?.abort();
    channel?.close();
    window.removeEventListener("wiki:changed", onChange);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("storage", onStorage);
  };
}
