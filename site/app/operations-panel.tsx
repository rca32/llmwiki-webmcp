"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { buildPortableProjection } from "../lib/portable-package";
import { useI18n } from "@/components/i18n-provider";

type Capabilities = {
  can_bootstrap: boolean;
  can_read: boolean;
  can_export_portable: boolean;
  can_manage_members: boolean;
  can_full_backup: boolean;
  can_import: boolean;
};
type Envelope<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        details: Record<string, unknown>;
      };
    };
type Member = {
  user_email: string;
  role: "owner" | "editor" | "viewer";
  created_at: string;
};
type AuditEvent = {
  id: string;
  actor_email: string;
  origin: string;
  action: string;
  target_type: string;
  target_id: string;
  outcome: string;
  request_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
};
type BackupPart = {
  number: number;
  kind: string;
  filename: string;
  size_bytes: number;
  sha256: string;
  url: string;
};
type BackupManifest = {
  schema_version: number;
  backup_run_id: string;
  exported_at: string;
  wiki_id: string;
  profile: "portable" | "full";
  page_count: number;
  attachment_count: number;
  revision_count: number;
  parts: BackupPart[];
  manifest_hash: string;
};
type Operations = {
  usage: Record<string, number | string> | null;
  latest_backup: Record<string, unknown> | null;
  latest_acknowledged_full_backup: Record<string, unknown> | null;
  pending_repairs: number;
  search_benchmark_enabled: boolean;
  webmcp_metrics: Array<{
    tool_name: string;
    outcome: "success" | "denied" | "conflict" | "validation" | "error";
    invocation_count: number;
    average_latency_ms: number;
    max_latency_ms: number;
    last_latency_ms: number;
    last_correlation_id: string;
    last_invoked_at: string;
  }>;
  api_metrics: Array<{
    command_name: string;
    outcome: "success" | "denied" | "conflict" | "validation" | "error";
    request_count: number;
    average_latency_ms: number;
    max_latency_ms: number;
    last_latency_ms: number;
    last_request_id: string;
    last_requested_at: string;
  }>;
  api_measurements: Array<{
    command_name: string;
    result_sample_count: number;
    total_result_count: number;
    average_result_count: number;
    max_result_count: number;
    last_result_count: number;
    size_sample_count: number;
    total_size_bytes: number;
    average_size_bytes: number;
    max_size_bytes: number;
    last_size_bytes: number;
    last_measured_at: string;
  }>;
};

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
async function sha256(data: Uint8Array) {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
function download(data: Blob, filename: string) {
  const url = URL.createObjectURL(data),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function arrayBufferOf(data: Uint8Array) {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy.buffer;
}
function bytesLabel(value: unknown) {
  const bytes = Number(value ?? 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function OperationsPanel({
  capabilities,
  siteVersion,
  hasWiki,
  writeMode,
  writeModeReason,
  onWorkspaceChanged,
}: {
  capabilities: Capabilities;
  siteVersion: number;
  hasWiki: boolean;
  writeMode: "read_write" | "read_only";
  writeModeReason: string | null;
  onWorkspaceChanged: () => Promise<void>;
}) {
  const { language, t } = useI18n();
  const [members, setMembers] = useState<Member[]>([]),
    [events, setEvents] = useState<AuditEvent[]>([]),
    [operations, setOperations] = useState<Operations | null>(null),
    [fullBackupStale, setFullBackupStale] = useState(false),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [message, setMessage] = useState<string | null>(null),
    [includeMemberReference, setIncludeMemberReference] = useState(false),
    [maintenanceReason, setMaintenanceReason] = useState(writeModeReason ?? ""),
    [memberEmail, setMemberEmail] = useState(""),
    [memberRole, setMemberRole] = useState<"editor" | "viewer">("editor");
  const importRef = useRef<HTMLInputElement>(null);
  const refresh = useCallback(async () => {
    if (!hasWiki) return;
    const tasks: Promise<unknown>[] = [
      api<{ events: AuditEvent[] }>("/api/audit?limit=50").then((data) =>
        setEvents(data.events),
      ),
    ];
    if (capabilities.can_manage_members)
      tasks.push(
        api<{ members: Member[] }>("/api/members").then((data) =>
          setMembers(data.members),
        ),
      );
    if (capabilities.can_full_backup)
      tasks.push(
        api<Operations>("/api/operations").then((data) => {
          setOperations(data);
          const acknowledgedAt =
              data.latest_acknowledged_full_backup?.acknowledged_at,
            acknowledgedTime = acknowledgedAt
              ? new Date(String(acknowledgedAt)).getTime()
              : Number.NaN;
          setFullBackupStale(
            Number.isFinite(acknowledgedTime) &&
              Date.now() - acknowledgedTime > 7 * 86_400_000,
          );
        }),
      );
    await Promise.allSettled(tasks);
  }, [capabilities.can_full_backup, capabilities.can_manage_members, hasWiki]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function createEmptyWiki() {
    if (!capabilities.can_bootstrap || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await api("/api/wikis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Liminal Wiki",
          expected_version: siteVersion,
        }),
      });
      await onWorkspaceChanged();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "빈 위키를 만들지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function changeWriteMode() {
    if (!capabilities.can_manage_members || busy) return;
    const nextMode = writeMode === "read_only" ? "read_write" : "read_only";
    if (nextMode === "read_only" && !maintenanceReason.trim()) {
      setMessage("읽기 전용 전환 사유를 입력하세요.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api("/api/maintenance/write-mode", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          write_mode: nextMode,
          reason: nextMode === "read_only" ? maintenanceReason.trim() : null,
        }),
      });
      setMessage(
        nextMode === "read_only"
          ? "Site를 읽기 전용 모드로 전환했습니다."
          : "Site 쓰기를 다시 활성화했습니다.",
      );
      if (nextMode === "read_write") setMaintenanceReason("");
      await onWorkspaceChanged();
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "쓰기 운영 모드를 변경하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function exportBackup(profile: "portable" | "full") {
    setBusy(true);
    setMessage(null);
    setProgress("백업 manifest 준비 중…");
    try {
      const { manifest } = await api<{ manifest: BackupManifest }>(
          "/api/export/prepare",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              profile,
              include_member_reference: includeMemberReference,
            }),
          },
        ),
        files: Record<string, Uint8Array> = {
          "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
        };
      for (let index = 0; index < manifest.parts.length; index++) {
        const part = manifest.parts[index];
        setProgress(`백업 파트 확인 중 ${index + 1}/${manifest.parts.length}`);
        const response = await fetch(part.url, { credentials: "same-origin" });
        if (!response.ok)
          throw new Error(`${part.filename} 다운로드에 실패했습니다.`);
        const content = new Uint8Array(await response.arrayBuffer());
        if (
          content.byteLength !== part.size_bytes ||
          (await sha256(content)) !== part.sha256
        )
          throw new Error(`${part.filename} checksum이 일치하지 않습니다.`);
        files[part.filename] = content;
      }
      const metadataPart = manifest.parts.find(
        (part) => part.kind === "metadata",
      );
      if (!metadataPart || !files[metadataPart.filename])
        throw new Error("백업 metadata 파트가 없습니다.");
      Object.assign(
        files,
        buildPortableProjection(files[metadataPart.filename]),
      );
      setProgress("백업 패키지 생성 중…");
      const archive = zipSync(files, { level: 0 });
      await api(`/api/export/${manifest.backup_run_id}/ack`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          manifest_hash: manifest.manifest_hash,
          parts: manifest.parts.map(({ number, sha256 }) => ({
            number,
            sha256,
          })),
        }),
      });
      setMessage(
        `${profile === "full" ? "전체" : "이동용"} 백업 ${manifest.parts.length}개 파트를 검증하고 다운로드를 시작했습니다.`,
      );
      await refresh();
      // Sites hosts may reload the page when a Blob download begins. Persist
      // the verified manifest ACK before triggering that browser-owned flow.
      download(
        new Blob([arrayBufferOf(archive)], { type: "application/zip" }),
        `liminal-wiki-${profile}-${manifest.backup_run_id}.zip`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "백업을 만들지 못했습니다.",
      );
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  async function importBackup(file: File) {
    setBusy(true);
    setMessage(null);
    setProgress("백업 패키지 검사 중…");
    try {
      const files = unzipSync(new Uint8Array(await file.arrayBuffer())),
        manifestBytes = files["manifest.json"];
      if (!manifestBytes)
        throw new Error("manifest.json이 없는 백업 패키지입니다.");
      const manifest = JSON.parse(strFromU8(manifestBytes)) as BackupManifest;
      const metadataPart = manifest.parts.find(
          (part) => part.kind === "metadata" && part.number === 0,
        ),
        metadataBytes = metadataPart ? files[metadataPart.filename] : null,
        metadata = metadataBytes
          ? (JSON.parse(strFromU8(metadataBytes)) as Record<string, unknown>)
          : {},
        memberReferences = Array.isArray(metadata.members_reference)
          ? (metadata.members_reference as Record<string, unknown>[]).slice(
              0,
              20,
            )
          : [],
        memberReferenceLines = memberReferences.map((member) => {
          const email =
              typeof member.user_email === "string"
                ? member.user_email.slice(0, 254)
                : "알 수 없는 사용자",
            role =
              typeof member.role === "string"
                ? member.role.slice(0, 20)
                : "unknown";
          return `참조 멤버: ${email} (${role})`;
        });
      const confirmed = window.confirm(
        [
          "이 빈 Site에 다음 백업을 복원할까요?",
          `프로필: ${manifest.profile}`,
          `페이지: ${manifest.page_count} · 첨부: ${manifest.attachment_count} · 리비전: ${manifest.revision_count}`,
          `생성 시각: ${new Date(manifest.exported_at).toLocaleString("ko-KR")}`,
          ...memberReferenceLines,
          ...(memberReferences.length
            ? [
                "참조 멤버와 원래 역할은 표시만 하며 권한으로 복원하지 않습니다.",
              ]
            : []),
          "복원이 완료되면 이 Site의 활성 위키가 됩니다.",
        ].join("\n"),
      );
      if (!confirmed) {
        setMessage("백업 복원을 취소했습니다.");
        return;
      }
      const { session_id, total_batches } = await api<{
        session_id: string;
        total_batches: number;
      }>("/api/import/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ manifest }),
      });
      for (let index = 0; index < manifest.parts.length; index++) {
        const part = manifest.parts[index],
          content = files[part.filename];
        if (!content) throw new Error(`${part.filename} 파트가 없습니다.`);
        setProgress(`복원 파트 업로드 중 ${index + 1}/${total_batches}`);
        const hash = await sha256(content);
        if (hash !== part.sha256 || content.byteLength !== part.size_bytes)
          throw new Error(`${part.filename} checksum이 일치하지 않습니다.`);
        await api(
          `/api/import/sessions/${session_id}/batches?part=${part.number}`,
          {
            method: "POST",
            headers: { "content-type": "application/octet-stream" },
            body: arrayBufferOf(content),
          },
        );
      }
      let commitAttempt = 0,
        commitResult: {
          status: "committing" | "committed";
          remaining_parts?: number;
        };
      do {
        commitAttempt++;
        setProgress(
          commitAttempt === 1
            ? "검증된 위키 확정 중…"
            : `복원 객체 확정 중 · 남은 파트 ${commitResult!.remaining_parts ?? 0}`,
        );
        commitResult = await api(`/api/import/sessions/${session_id}/commit`, {
          method: "POST",
        });
        if (commitAttempt > Math.ceil(total_batches / 8) + 2)
          throw new Error("복원 확정이 예상 횟수 안에 완료되지 않았습니다.");
      } while (commitResult.status === "committing");
      setMessage(
        memberReferences.length
          ? `빈 Site에 백업을 복원했습니다. 참조 멤버 ${memberReferences.length}명은 권한으로 활성화하지 않았습니다.`
          : "빈 Site에 백업을 복원했습니다.",
      );
      await onWorkspaceChanged();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "백업을 복원하지 못했습니다.",
      );
    } finally {
      setBusy(false);
      setProgress("");
      if (importRef.current) importRef.current.value = "";
    }
  }

  async function saveMember() {
    if (!memberEmail.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      await api("/api/members", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: memberEmail.trim(), role: memberRole }),
      });
      setMemberEmail("");
      await refresh();
      setMessage("멤버 권한을 저장했습니다.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "멤버를 저장하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function changeRole(member: Member, role: "editor" | "viewer") {
    setBusy(true);
    try {
      await api(`/api/members/${encodeURIComponent(member.user_email)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "역할을 변경하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function removeMember(member: Member) {
    if (!window.confirm(`${member.user_email} 멤버를 제거할까요?`)) return;
    setBusy(true);
    try {
      await api(`/api/members/${encodeURIComponent(member.user_email)}`, {
        method: "DELETE",
      });
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "멤버를 제거하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function transferOwner(member: Member) {
    const confirmation = window.prompt(
      `소유권을 이전하려면 TRANSFER ${member.user_email} 을 입력하세요.`,
    );
    if (confirmation === null) return;
    setBusy(true);
    try {
      await api("/api/members/transfer-ownership", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: member.user_email, confirmation }),
      });
      setMessage("소유권을 이전했습니다. 현재 세션 권한을 새로 읽습니다.");
      await onWorkspaceChanged();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "소유권을 이전하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function runMaintenance() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api<Record<string, number>>(
        "/api/maintenance/storage",
        { method: "POST" },
      );
      setMessage(
        `저장소 점검 완료: ${Object.entries(result)
          .map(([key, value]) => `${key} ${value}`)
          .join(" · ")}`,
      );
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "저장소 점검을 완료하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function runAtomicityProbe() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api<{
        atomic: boolean;
        batch_rejected: boolean;
        partial_commit_detected: boolean;
        revision_compensation: {
          direct_cleanup: boolean;
          queued_repair: boolean;
        };
      }>("/api/maintenance/diagnostics", { method: "POST" });
      const healthy =
        result.atomic &&
        result.revision_compensation.direct_cleanup &&
        result.revision_compensation.queued_repair;
      setMessage(
        healthy
          ? "D1 batch 무부분-commit과 대형 리비전 R2 보상·repair 재처리를 확인했습니다."
          : "원자성 또는 R2 보상 진단이 실패했습니다. 쓰기를 중단하고 repair 상태를 확인하세요.",
      );
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "D1 원자성 검사를 완료하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function runSearchBenchmark() {
    if (!operations?.search_benchmark_enabled || busy) return;
    const runId = crypto.randomUUID();
    let cleanupRequired = false;
    setBusy(true);
    setMessage(null);
    try {
      for (let offset = 0; offset < 10_000; offset += 1_000) {
        cleanupRequired = true;
        setProgress(
          `성능 fixture 준비 중 ${offset + 1}-${offset + 1_000}/10,000`,
        );
        await api("/api/maintenance/search-benchmark", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "seed",
            run_id: runId,
            page_count: 10_000,
            offset,
            count: 1_000,
          }),
        });
      }
      setProgress("10,000페이지 search/read/tree 측정 중…");
      const result = await api<{
        search: { p95_ms: number; target_met: boolean };
        page_read: { p95_ms: number; target_met: boolean };
        tree_first_page: {
          p95_ms: number;
          returned_node_count: number;
          node_cap_met: boolean;
        };
      }>("/api/maintenance/search-benchmark", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "measure",
          run_id: runId,
          page_count: 10_000,
        }),
      });
      setMessage(
        `10,000페이지 pilot 통과: search p95 ${result.search.p95_ms}ms · read p95 ${result.page_read.p95_ms}ms · tree p95 ${result.tree_first_page.p95_ms}ms (${result.tree_first_page.returned_node_count}개)`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "10,000페이지 성능 pilot을 완료하지 못했습니다.",
      );
    } finally {
      if (cleanupRequired) {
        setProgress("성능 fixture 삭제·검증 중…");
        try {
          const cleanup = await api<{ cleanup_verified: boolean }>(
            "/api/maintenance/search-benchmark",
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ action: "cleanup", run_id: runId }),
            },
          );
          if (!cleanup.cleanup_verified)
            setMessage(
              "성능 fixture 정리를 확인하지 못했습니다. Site 쓰기를 중단하고 점검하세요.",
            );
        } catch (error) {
          setMessage(
            error instanceof Error
              ? `성능 fixture 정리 실패: ${error.message}`
              : "성능 fixture 정리에 실패했습니다.",
          );
        }
      }
      setProgress("");
      setBusy(false);
      await refresh();
    }
  }

  const acknowledgedAt =
      operations?.latest_acknowledged_full_backup?.acknowledged_at,
    acknowledgedDate = acknowledgedAt ? new Date(String(acknowledgedAt)) : null,
    webmcpMetrics = operations?.webmcp_metrics ?? [],
    webmcpCalls = webmcpMetrics.reduce(
      (total, metric) => total + Number(metric.invocation_count),
      0,
    ),
    webmcpWeightedLatency = webmcpMetrics.reduce(
      (total, metric) =>
        total +
        Number(metric.average_latency_ms) * Number(metric.invocation_count),
      0,
    ),
    webmcpAverageLatency = webmcpCalls
      ? Math.round(webmcpWeightedLatency / webmcpCalls)
      : 0,
    apiMetrics = operations?.api_metrics ?? [],
    apiRequests = apiMetrics.reduce(
      (total, metric) => total + Number(metric.request_count),
      0,
    ),
    apiWeightedLatency = apiMetrics.reduce(
      (total, metric) =>
        total +
        Number(metric.average_latency_ms) * Number(metric.request_count),
      0,
    ),
    apiAverageLatency = apiRequests
      ? Math.round(apiWeightedLatency / apiRequests)
      : 0,
    apiMeasurements = operations?.api_measurements ?? [],
    searchMeasurement = apiMeasurements.find(
      (measurement) => measurement.command_name === "search.query",
    ),
    uploadMeasurement = apiMeasurements.find(
      (measurement) => measurement.command_name === "attachment.upload",
    );

  if (!hasWiki)
    return (
      <section className="bootstrap-stage">
        <div className="bootstrap-card">
          <p className="eyebrow">NEW KNOWLEDGE SPACE</p>
          <h1>{t("ops.startTitle")}</h1>
          <p>{t("ops.startDescription")}</p>
          {!capabilities.can_bootstrap && (
            <p className="context-empty">{t("ops.noWikiAccess")}</p>
          )}
          {message && (
            <div className="conflict-banner" role="alert">
              {message}
            </div>
          )}
          <div className="bootstrap-actions">
            <button
              className="save-button"
              onClick={() => void createEmptyWiki()}
              disabled={busy || !capabilities.can_bootstrap}
            >
              {t("ops.createEmpty")}
            </button>
            <button
              className="ghost-button"
              onClick={() => importRef.current?.click()}
              disabled={busy || !capabilities.can_bootstrap}
            >
              {t("ops.restoreBackup")}
            </button>
            <input
              ref={importRef}
              hidden
              type="file"
              accept=".zip,application/zip"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importBackup(file);
              }}
            />
          </div>
          {progress && (
            <p className="operation-progress" aria-live="polite">
              {progress}
            </p>
          )}
        </div>
      </section>
    );

  return (
    <div className="operations-stage">
      <header>
        <div>
          <span>{t("nav.operations")}</span>
          <h2>{t("ops.title")}</h2>
          <p>{t("ops.description")}</p>
        </div>
        <button
          className="ghost-button"
          onClick={() => void refresh()}
          disabled={busy}
        >
          {t("ops.refresh")}
        </button>
      </header>
      {message && (
        <div className="conflict-banner" role="status">
          {message}
        </div>
      )}
      {progress && (
        <p className="operation-progress" aria-live="polite">
          {progress}
        </p>
      )}
      <div className="operations-grid">
        {capabilities.can_manage_members && (
          <section className="operation-card">
            <span>{t("ops.editingSection")}</span>
            <h3>
              {writeMode === "read_only"
                ? t("ops.writeReadOnly")
                : t("ops.writeEnabled")}
            </h3>
            <p>{t("ops.writeHint")}</p>
            <label className="backup-option">
              {t("ops.reason")}
              <input
                aria-label={t("ops.reason")}
                value={maintenanceReason}
                onChange={(event) => setMaintenanceReason(event.target.value)}
                disabled={busy || writeMode === "read_only"}
                placeholder={t("ops.reasonPlaceholder")}
              />
            </label>
            {writeMode === "read_only" && writeModeReason && (
              <small className="warning-text">
                {t("ops.currentReason", { reason: writeModeReason })}
              </small>
            )}
            <div className="operation-actions">
              <button onClick={() => void changeWriteMode()} disabled={busy}>
                {writeMode === "read_only"
                  ? t("ops.resumeWriting")
                  : t("ops.enableReadOnly")}
              </button>
            </div>
          </section>
        )}
        <section className="operation-card">
          <span>{t("ops.backupSection")}</span>
          <h3>{t("ops.backupTitle")}</h3>
          <p>{t("ops.backupDescription")}</p>
          {capabilities.can_full_backup && (
            <label className="backup-option">
              <input
                type="checkbox"
                checked={includeMemberReference}
                onChange={(event) =>
                  setIncludeMemberReference(event.target.checked)
                }
                disabled={busy}
              />
              {t("ops.includeMembers")}
              <small>{t("ops.privacyWarning")}</small>
            </label>
          )}
          <div className="operation-actions">
            <button
              onClick={() => void exportBackup("portable")}
              disabled={busy || !capabilities.can_export_portable}
            >
              {t("ops.portableBackup")}
            </button>
            {capabilities.can_full_backup && (
              <button onClick={() => void exportBackup("full")} disabled={busy}>
                {t("ops.fullBackup")}
              </button>
            )}
            <button
              onClick={() => importRef.current?.click()}
              disabled={busy || !capabilities.can_import}
            >
              {t("ops.restoreEmpty")}
            </button>
            <input
              ref={importRef}
              hidden
              type="file"
              accept=".zip,application/zip"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importBackup(file);
              }}
            />
          </div>
          {acknowledgedDate ? (
            <small className={fullBackupStale ? "warning-text" : undefined}>
              {fullBackupStale ? t("ops.lastBackupOld") : t("ops.lastBackup")}
              {acknowledgedDate.toLocaleString(language)}
            </small>
          ) : capabilities.can_full_backup ? (
            <small className="warning-text">{t("ops.noBackup")}</small>
          ) : null}
        </section>
        {capabilities.can_full_backup && (
          <section className="operation-card">
            <span>{t("ops.storageSection")}</span>
            <h3>{t("ops.storageTitle")}</h3>
            <div className="metric-grid">
              <div>
                <strong>{Number(operations?.usage?.page_count ?? 0)}</strong>
                <small>{t("ops.pages")}</small>
              </div>
              <div>
                <strong>
                  {Number(operations?.usage?.revision_count ?? 0)}
                </strong>
                <small>{t("ops.revisions")}</small>
              </div>
              <div>
                <strong>
                  {Number(operations?.usage?.attachment_count ?? 0)}
                </strong>
                <small>{t("ops.attachments")}</small>
              </div>
              <div>
                <strong>{operations?.pending_repairs ?? 0}</strong>
                <small>{t("ops.pendingRepairs")}</small>
              </div>
            </div>
            <p>
              {t("ops.storageUsage", {
                pages: bytesLabel(operations?.usage?.page_bytes),
                revisions: bytesLabel(
                  operations?.usage?.r2_ready_revision_bytes,
                ),
                attachments: bytesLabel(
                  operations?.usage?.r2_ready_attachment_bytes,
                ),
              })}
            </p>
            <div className="operation-actions">
              <button onClick={() => void runMaintenance()} disabled={busy}>
                {t("ops.runStorageCheck")}
              </button>
            </div>
          </section>
        )}
        {capabilities.can_full_backup && (
          <details className="operations-advanced">
            <summary>
              <strong>{t("ops.advancedTitle")}</strong>
              <span>{t("ops.advancedDescription")}</span>
            </summary>
            <div className="operations-advanced-grid">
              <section className="operation-card">
                <span>{t("ops.storageSection")}</span>
                <h3>{t("ops.technicalChecksTitle")}</h3>
                <p>{t("ops.technicalChecksDescription")}</p>
                <div className="operation-actions">
                  <button
                    onClick={() => void runAtomicityProbe()}
                    disabled={busy}
                  >
                    {t("ops.atomicityCheck")}
                  </button>
                  {operations?.search_benchmark_enabled && (
                    <button
                      onClick={() => void runSearchBenchmark()}
                      disabled={busy}
                    >
                      {t("ops.performanceCheck")}
                    </button>
                  )}
                </div>
                {operations?.search_benchmark_enabled && (
                  <small className="warning-text">
                    {t("ops.performanceHint")}
                  </small>
                )}
              </section>
              {capabilities.can_full_backup && (
                <section className="operation-card webmcp-observability-card">
                  <span>{t("ops.agentSection")}</span>
                  <h3>{t("ops.agentTitle")}</h3>
                  <p>{t("ops.agentDescription")}</p>
                  <div className="metric-grid webmcp-summary">
                    <div>
                      <strong>{webmcpCalls}</strong>
                      <small>{t("ops.totalCalls")}</small>
                    </div>
                    <div>
                      <strong>{webmcpAverageLatency} ms</strong>
                      <small>{t("ops.averageLatency")}</small>
                    </div>
                    <div>
                      <strong>
                        {webmcpMetrics.reduce(
                          (total, metric) =>
                            total +
                            (metric.outcome === "success"
                              ? Number(metric.invocation_count)
                              : 0),
                          0,
                        )}
                      </strong>
                      <small>{t("ops.success")}</small>
                    </div>
                  </div>
                  {webmcpMetrics.length ? (
                    <div
                      className="webmcp-metric-list"
                      aria-label={t("ops.agentTitle")}
                    >
                      {webmcpMetrics.map((metric) => (
                        <article
                          key={`${metric.tool_name}:${metric.outcome}`}
                          data-outcome={metric.outcome}
                        >
                          <div>
                            <strong>{metric.tool_name}</strong>
                            <small>
                              {t("ops.metricDetail", {
                                outcome: metric.outcome,
                                average: metric.average_latency_ms,
                                maximum: metric.max_latency_ms,
                              })}
                            </small>
                          </div>
                          <b>
                            {t("ops.callCount", {
                              count: metric.invocation_count,
                            })}
                          </b>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <small>{t("ops.noWebmcp")}</small>
                  )}
                </section>
              )}
              {capabilities.can_full_backup && (
                <section className="operation-card webmcp-observability-card">
                  <span>{t("ops.apiSection")}</span>
                  <h3>{t("ops.apiTitle")}</h3>
                  <p>{t("ops.apiDescription")}</p>
                  <div className="metric-grid webmcp-summary">
                    <div>
                      <strong>{apiRequests}</strong>
                      <small>{t("ops.totalRequests")}</small>
                    </div>
                    <div>
                      <strong>{apiAverageLatency} ms</strong>
                      <small>{t("ops.averageLatency")}</small>
                    </div>
                    <div>
                      <strong>
                        {apiMetrics.reduce(
                          (total, metric) =>
                            total +
                            (metric.outcome === "success"
                              ? Number(metric.request_count)
                              : 0),
                          0,
                        )}
                      </strong>
                      <small>{t("ops.success")}</small>
                    </div>
                    <div>
                      <strong>
                        {Number(searchMeasurement?.average_result_count ?? 0)}
                      </strong>
                      <small>{t("ops.averageSearchResults")}</small>
                    </div>
                    <div>
                      <strong>
                        {bytesLabel(uploadMeasurement?.total_size_bytes)}
                      </strong>
                      <small>{t("ops.totalUploads")}</small>
                    </div>
                  </div>
                  {apiMetrics.length ? (
                    <div
                      className="webmcp-metric-list"
                      role="region"
                      aria-label={t("ops.apiTitle")}
                      tabIndex={0}
                    >
                      {apiMetrics.map((metric) => (
                        <article
                          key={`${metric.command_name}:${metric.outcome}`}
                          data-outcome={metric.outcome}
                        >
                          <div>
                            <strong>{metric.command_name}</strong>
                            <small>
                              {t("ops.metricDetail", {
                                outcome: metric.outcome,
                                average: metric.average_latency_ms,
                                maximum: metric.max_latency_ms,
                              })}
                            </small>
                          </div>
                          <b>
                            {t("ops.callCount", {
                              count: metric.request_count,
                            })}
                          </b>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <small>{t("ops.noApi")}</small>
                  )}
                </section>
              )}
            </div>
          </details>
        )}
        {capabilities.can_manage_members && (
          <section className="operation-card members-card">
            <span>{t("ops.peopleSection")}</span>
            <h3>{t("ops.membersTitle")}</h3>
            <div className="member-form">
              <input
                type="email"
                value={memberEmail}
                onChange={(event) => setMemberEmail(event.target.value)}
                placeholder="member@example.com"
                aria-label={t("ops.memberEmail")}
              />
              <select
                value={memberRole}
                onChange={(event) =>
                  setMemberRole(event.target.value as "editor" | "viewer")
                }
                aria-label={t("ops.memberRole")}
              >
                <option value="editor">{t("ops.roleEditor")}</option>
                <option value="viewer">{t("ops.roleViewer")}</option>
              </select>
              <button
                onClick={() => void saveMember()}
                disabled={busy || !memberEmail.trim()}
              >
                {t("ops.saveMember")}
              </button>
            </div>
            <div className="member-list">
              {members.map((member) => (
                <div key={member.user_email}>
                  <span>
                    <strong>{member.user_email}</strong>
                    <small>
                      {member.role === "owner"
                        ? t("ops.roleOwner")
                        : member.role === "editor"
                          ? t("ops.roleEditor")
                          : t("ops.roleViewer")}
                    </small>
                  </span>
                  {member.role !== "owner" && (
                    <span className="member-actions">
                      <button
                        onClick={() =>
                          void changeRole(
                            member,
                            member.role === "editor" ? "viewer" : "editor",
                          )
                        }
                        disabled={busy}
                      >
                        {member.role === "editor"
                          ? t("ops.changeToViewer")
                          : t("ops.changeToEditor")}
                      </button>
                      <button
                        onClick={() => void transferOwner(member)}
                        disabled={busy}
                      >
                        {t("ops.transferOwnership")}
                      </button>
                      <button
                        className="danger"
                        onClick={() => void removeMember(member)}
                        disabled={busy}
                      >
                        {t("ops.remove")}
                      </button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
      <details className="audit-card">
        <summary>
          <span>{t("ops.auditSection")}</span>
          <h3>{t("ops.recentChanges")}</h3>
        </summary>
        <div
          className="audit-list"
          role="region"
          aria-label={t("ops.recentAudit")}
          tabIndex={0}
        >
          {events.map((event) => (
            <article key={event.id}>
              <i className={`outcome-${event.outcome}`} />
              <span>
                <strong>{event.action}</strong>
                <small>
                  {event.actor_email} · {event.origin} ·{" "}
                  {new Date(event.created_at).toLocaleString(language)}
                </small>
              </span>
              <code>{event.request_id}</code>
            </article>
          ))}
        </div>
      </details>
    </div>
  );
}
