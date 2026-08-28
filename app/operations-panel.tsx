"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { buildPortableProjection } from "../lib/portable-package";

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
  onWorkspaceChanged,
}: {
  capabilities: Capabilities;
  siteVersion: number;
  hasWiki: boolean;
  onWorkspaceChanged: () => Promise<void>;
}) {
  const [members, setMembers] = useState<Member[]>([]),
    [events, setEvents] = useState<AuditEvent[]>([]),
    [operations, setOperations] = useState<Operations | null>(null),
    [fullBackupStale, setFullBackupStale] = useState(false),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [message, setMessage] = useState<string | null>(null),
    [includeMemberReference, setIncludeMemberReference] = useState(false),
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
      download(
        new Blob([arrayBufferOf(archive)], { type: "application/zip" }),
        `liminal-wiki-${profile}-${manifest.backup_run_id}.zip`,
      );
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
        `${profile === "full" ? "전체" : "이동용"} 백업 ${manifest.parts.length}개 파트를 검증하고 저장했습니다.`,
      );
      await refresh();
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
      const confirmed = window.confirm(
        [
          "이 빈 Site에 다음 백업을 복원할까요?",
          `프로필: ${manifest.profile}`,
          `페이지: ${manifest.page_count} · 첨부: ${manifest.attachment_count} · 리비전: ${manifest.revision_count}`,
          `생성 시각: ${new Date(manifest.exported_at).toLocaleString("ko-KR")}`,
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
      setProgress("검증된 위키 확정 중…");
      await api(`/api/import/sessions/${session_id}/commit`, {
        method: "POST",
      });
      setMessage("빈 Site에 백업을 복원했습니다.");
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

  const acknowledgedAt =
      operations?.latest_acknowledged_full_backup?.acknowledged_at,
    acknowledgedDate = acknowledgedAt ? new Date(String(acknowledgedAt)) : null;

  if (!hasWiki)
    return (
      <section className="bootstrap-stage">
        <div className="bootstrap-card">
          <p className="eyebrow">NEW KNOWLEDGE SPACE</p>
          <h1>Liminal Wiki 시작하기</h1>
          <p>
            새 빈 위키를 만들거나, 다른 Site에서 내려받은 검증된 전체 백업을
            복원하세요. 복원은 활성 위키가 없는 Site에서만 가능합니다.
          </p>
          {message && (
            <div className="conflict-banner" role="alert">
              {message}
            </div>
          )}
          <div className="bootstrap-actions">
            <button
              className="save-button"
              onClick={() => void createEmptyWiki()}
              disabled={busy}
            >
              빈 위키 만들기
            </button>
            <button
              className="ghost-button"
              onClick={() => importRef.current?.click()}
              disabled={busy}
            >
              백업에서 복원
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
          <span>WIKI OPERATIONS</span>
          <h2>운영과 복구</h2>
          <p>권한, 백업, 저장소 상태와 최근 변경을 한곳에서 확인합니다.</p>
        </div>
        <button
          className="ghost-button"
          onClick={() => void refresh()}
          disabled={busy}
        >
          새로 고침
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
        <section className="operation-card">
          <span>BACKUP & RESTORE</span>
          <h3>이동 가능한 지식 보관</h3>
          <p>
            모든 파트의 크기와 SHA-256을 브라우저에서 다시 확인한 뒤 하나의
            ZIP으로 저장하고 ACK합니다.
          </p>
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
              멤버 이메일·역할 참조 포함
              <small>다른 사람의 개인정보가 ZIP에 들어갑니다.</small>
            </label>
          )}
          <div className="operation-actions">
            <button
              onClick={() => void exportBackup("portable")}
              disabled={busy || !capabilities.can_export_portable}
            >
              이동용 백업
            </button>
            {capabilities.can_full_backup && (
              <button onClick={() => void exportBackup("full")} disabled={busy}>
                전체 백업
              </button>
            )}
            <button
              onClick={() => importRef.current?.click()}
              disabled={busy || !capabilities.can_import}
            >
              빈 Site에서 복원
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
              {fullBackupStale
                ? "마지막 전체 백업이 7일보다 오래되었습니다: "
                : "마지막 확인된 전체 백업: "}
              {acknowledgedDate.toLocaleString("ko-KR")}
            </small>
          ) : capabilities.can_full_backup ? (
            <small className="warning-text">확인된 전체 백업이 없습니다.</small>
          ) : null}
        </section>
        {capabilities.can_full_backup && (
          <section className="operation-card">
            <span>STORAGE HEALTH</span>
            <h3>저장소 상태</h3>
            <div className="metric-grid">
              <div>
                <strong>{Number(operations?.usage?.page_count ?? 0)}</strong>
                <small>페이지</small>
              </div>
              <div>
                <strong>
                  {Number(operations?.usage?.revision_count ?? 0)}
                </strong>
                <small>리비전</small>
              </div>
              <div>
                <strong>
                  {Number(operations?.usage?.attachment_count ?? 0)}
                </strong>
                <small>첨부</small>
              </div>
              <div>
                <strong>{operations?.pending_repairs ?? 0}</strong>
                <small>대기 repair</small>
              </div>
            </div>
            <p>
              페이지 {bytesLabel(operations?.usage?.page_bytes)} · R2 리비전{" "}
              {bytesLabel(operations?.usage?.r2_ready_revision_bytes)} · 첨부{" "}
              {bytesLabel(operations?.usage?.r2_ready_attachment_bytes)}
            </p>
            <div className="operation-actions">
              <button onClick={() => void runMaintenance()} disabled={busy}>
                저장소 점검 실행
              </button>
              <button onClick={() => void runAtomicityProbe()} disabled={busy}>
                D1 원자성 검사
              </button>
            </div>
          </section>
        )}
        {capabilities.can_manage_members && (
          <section className="operation-card members-card">
            <span>MEMBERS</span>
            <h3>멤버와 역할</h3>
            <div className="member-form">
              <input
                type="email"
                value={memberEmail}
                onChange={(event) => setMemberEmail(event.target.value)}
                placeholder="member@example.com"
                aria-label="멤버 이메일"
              />
              <select
                value={memberRole}
                onChange={(event) =>
                  setMemberRole(event.target.value as "editor" | "viewer")
                }
                aria-label="멤버 역할"
              >
                <option value="editor">editor</option>
                <option value="viewer">viewer</option>
              </select>
              <button
                onClick={() => void saveMember()}
                disabled={busy || !memberEmail.trim()}
              >
                추가·저장
              </button>
            </div>
            <div className="member-list">
              {members.map((member) => (
                <div key={member.user_email}>
                  <span>
                    <strong>{member.user_email}</strong>
                    <small>{member.role}</small>
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
                        {member.role === "editor" ? "viewer로" : "editor로"}
                      </button>
                      <button
                        onClick={() => void transferOwner(member)}
                        disabled={busy}
                      >
                        소유권 이전
                      </button>
                      <button
                        className="danger"
                        onClick={() => void removeMember(member)}
                        disabled={busy}
                      >
                        제거
                      </button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
      <section className="audit-card">
        <div>
          <span>AUDIT TRAIL</span>
          <h3>최근 변경</h3>
        </div>
        <div
          className="audit-list"
          role="region"
          aria-label="최근 감사 이벤트"
          tabIndex={0}
        >
          {events.map((event) => (
            <article key={event.id}>
              <i className={`outcome-${event.outcome}`} />
              <span>
                <strong>{event.action}</strong>
                <small>
                  {event.actor_email} · {event.origin} ·{" "}
                  {new Date(event.created_at).toLocaleString("ko-KR")}
                </small>
              </span>
              <code>{event.request_id}</code>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
