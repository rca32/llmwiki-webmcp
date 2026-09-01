import { env } from "cloudflare:workers";
import {
  AppError,
  type ChangeSet,
  type LinkMode,
  type PageType,
  type RetrievalStatus,
  type Role,
  type WriteMode,
  type WikiPage,
} from "../lib/contracts";
import {
  addRelatedWikiLink,
  appendMarkdownToSection,
  extractWikiLinks,
  parseFrontmatter,
  sha256,
  sha256Bytes,
  slugify,
  stableJson,
} from "../lib/validation";
import {
  selectRevisionPruneCandidates,
  type RevisionRetentionRow,
} from "../lib/revision-retention";
import { safeOperationalErrorTag } from "../lib/security-policy";
import { assertActiveAttachmentCapacity } from "../lib/storage-quota";
import { idempotencyDisposition } from "../lib/idempotency-policy";
import {
  isLegacyPublicDemoSlug,
  personalWikiIdentifiers,
} from "../lib/personal-wiki";
import {
  DEFAULT_OPERATING_CONTRACT,
  buildWikiLintReport,
  canonicalIngestPlanHash,
  classifyIngestPageAction,
  isIngestPlanExpired,
  parseOperatingContract,
  type IngestClaimDraft,
  type IngestPageDraft,
  type IngestRequest,
  type IngestSourceDraft,
  type WikiOperatingContract,
} from "../lib/llm-wiki-domain";
import {
  KNOWLEDGE_PLACEMENT_ROLES,
  KNOWLEDGE_PRESENTATIONS,
  parseKnowledgeMapPatch,
  type KnowledgeInsightBrief,
  type KnowledgeInsightEvidenceReference,
  type KnowledgeMapPatch,
  type KnowledgePlacementRole,
  type KnowledgePresentation,
  type TopicReference,
} from "../lib/knowledge-map";

const ROOT_PARENT = "__root__";
const INLINE_REVISION_BYTES = 64 * 1024;
const D1_SOFT_LIMIT_BYTES = 8 * 1024 * 1024 * 1024;
const R2_SOFT_LIMIT_BYTES = 20 * 1024 * 1024 * 1024;
let schemaReady: Promise<void> | null = null;
let telemetrySchemaReady: Promise<void> | null = null;

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS wikis (id TEXT PRIMARY KEY NOT NULL,slug TEXT NOT NULL UNIQUE,title TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS wiki_members (wiki_id TEXT NOT NULL,user_email TEXT NOT NULL,role TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(wiki_id,user_email),FOREIGN KEY(wiki_id) REFERENCES wikis(id))`,
  `CREATE INDEX IF NOT EXISTS idx_wiki_members_email ON wiki_members(user_email)`,
  `CREATE TABLE IF NOT EXISTS wiki_user_preferences (user_email TEXT PRIMARY KEY NOT NULL,active_wiki_id TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(active_wiki_id) REFERENCES wikis(id))`,
  `CREATE TABLE IF NOT EXISTS pages (id TEXT PRIMARY KEY NOT NULL,wiki_id TEXT NOT NULL,parent_id TEXT,parent_key TEXT NOT NULL,slug TEXT NOT NULL,title TEXT NOT NULL,page_type TEXT NOT NULL,markdown TEXT NOT NULL,source_url TEXT,retrieval_status TEXT,retrieved_at TEXT,extraction_method TEXT,confidence REAL,frontmatter_json TEXT NOT NULL DEFAULT '{}',version INTEGER NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0,created_by TEXT NOT NULL,updated_by TEXT NOT NULL,last_operation_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT,FOREIGN KEY(wiki_id) REFERENCES wikis(id))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_pages_sibling_slug ON pages(wiki_id,parent_key,slug)`,
  `CREATE INDEX IF NOT EXISTS idx_pages_wiki_parent ON pages(wiki_id,parent_id,sort_order)`,
  `CREATE INDEX IF NOT EXISTS idx_pages_wiki_updated ON pages(wiki_id,updated_at)`,
  `CREATE TABLE IF NOT EXISTS page_revisions (id TEXT PRIMARY KEY NOT NULL,page_id TEXT NOT NULL,version INTEGER NOT NULL,snapshot_inline TEXT,snapshot_object_key TEXT,content_sha256 TEXT NOT NULL,frontmatter_json TEXT NOT NULL DEFAULT '{}',change_summary TEXT,actor_email TEXT NOT NULL,origin TEXT NOT NULL,save_kind TEXT NOT NULL,operation_id TEXT,status TEXT NOT NULL DEFAULT 'ready',is_pinned INTEGER NOT NULL DEFAULT 0,pinned_at TEXT,created_at TEXT NOT NULL,FOREIGN KEY(page_id) REFERENCES pages(id))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_page_revisions_version ON page_revisions(page_id,version)`,
  `CREATE INDEX IF NOT EXISTS idx_page_revisions_recent ON page_revisions(page_id,created_at)`,
  `CREATE TABLE IF NOT EXISTS page_links (id TEXT PRIMARY KEY NOT NULL,wiki_id TEXT NOT NULL,source_page_id TEXT NOT NULL,target_page_id TEXT,target_text TEXT NOT NULL,link_kind TEXT NOT NULL,created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_page_links_source ON page_links(wiki_id,source_page_id)`,
  `CREATE INDEX IF NOT EXISTS idx_page_links_target ON page_links(wiki_id,target_page_id)`,
  `CREATE TABLE IF NOT EXISTS wiki_operating_contracts (wiki_id TEXT PRIMARY KEY NOT NULL,version INTEGER NOT NULL,contract_json TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL,last_operation_id TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS ingest_plans (id TEXT PRIMARY KEY NOT NULL,wiki_id TEXT NOT NULL,actor_email TEXT NOT NULL,status TEXT NOT NULL,plan_json TEXT NOT NULL,plan_hash TEXT NOT NULL,action_state_json TEXT NOT NULL DEFAULT '{}',apply_operation_id TEXT,failure_code TEXT,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,applied_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_ingest_plans_owner ON ingest_plans(wiki_id,actor_email,status,created_at)`,
  `CREATE TABLE IF NOT EXISTS knowledge_claims (id TEXT PRIMARY KEY NOT NULL,wiki_id TEXT NOT NULL,subject_page_id TEXT NOT NULL,predicate TEXT NOT NULL,object_page_id TEXT,object_value TEXT,source_page_id TEXT NOT NULL,evidence_fragment TEXT NOT NULL,confidence REAL NOT NULL,observed_at TEXT NOT NULL,valid_from TEXT,valid_to TEXT,supersedes_claim_id TEXT,created_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_claims_subject ON knowledge_claims(wiki_id,subject_page_id,created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_claims_source ON knowledge_claims(wiki_id,source_page_id,created_at)`,
  `CREATE TABLE IF NOT EXISTS knowledge_maps (wiki_id TEXT PRIMARY KEY NOT NULL,version INTEGER NOT NULL DEFAULT 0,overview_brief_json TEXT,overview_brief_basis_hash TEXT,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL,last_operation_id TEXT)`,
  `CREATE TABLE IF NOT EXISTS knowledge_map_plans (id TEXT PRIMARY KEY NOT NULL,wiki_id TEXT NOT NULL,actor_email TEXT NOT NULL,status TEXT NOT NULL,patch_json TEXT NOT NULL,plan_hash TEXT NOT NULL,apply_operation_id TEXT,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,applied_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_map_plans_owner ON knowledge_map_plans(wiki_id,actor_email,status,created_at)`,
  `CREATE TABLE IF NOT EXISTS knowledge_topics (id TEXT PRIMARY KEY NOT NULL,wiki_id TEXT NOT NULL,parent_topic_id TEXT,title TEXT NOT NULL,summary TEXT NOT NULL,presentation TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0,is_locked INTEGER NOT NULL DEFAULT 0,insight_brief_json TEXT,insight_brief_basis_hash TEXT,created_by TEXT NOT NULL,updated_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_topics_parent ON knowledge_topics(wiki_id,parent_topic_id,sort_order)`,
  `CREATE TABLE IF NOT EXISTS knowledge_placements (id TEXT PRIMARY KEY NOT NULL,wiki_id TEXT NOT NULL,topic_id TEXT NOT NULL,page_id TEXT NOT NULL,role TEXT NOT NULL,summary TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0,is_locked INTEGER NOT NULL DEFAULT 0,created_by TEXT NOT NULL,updated_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_placements_topic_page ON knowledge_placements(wiki_id,topic_id,page_id)`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_placements_page ON knowledge_placements(wiki_id,page_id)`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_placements_topic ON knowledge_placements(wiki_id,topic_id,sort_order)`,
  `CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY NOT NULL,wiki_id TEXT NOT NULL,page_id TEXT,object_key TEXT NOT NULL UNIQUE,filename TEXT NOT NULL,mime_type TEXT NOT NULL,size_bytes INTEGER NOT NULL,sha256 TEXT NOT NULL,uploaded_by TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,deleted_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_attachments_wiki_page ON attachments(wiki_id,page_id,status)`,
  `CREATE TABLE IF NOT EXISTS idempotency_keys (wiki_id TEXT NOT NULL,actor_email TEXT NOT NULL,operation_id TEXT NOT NULL,operation_name TEXT NOT NULL,request_hash TEXT NOT NULL,request_id TEXT NOT NULL,status TEXT NOT NULL,lease_expires_at TEXT NOT NULL,failure_retryable INTEGER,attempts INTEGER NOT NULL DEFAULT 1,result_json TEXT,created_at TEXT NOT NULL,completed_at TEXT,expires_at TEXT NOT NULL,PRIMARY KEY(wiki_id,actor_email,operation_name,operation_id))`,
  `CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY NOT NULL,wiki_id TEXT NOT NULL,actor_email TEXT NOT NULL,origin TEXT NOT NULL,action TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT NOT NULL,outcome TEXT NOT NULL,request_id TEXT NOT NULL,metadata_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS wiki_usage (wiki_id TEXT PRIMARY KEY NOT NULL,page_bytes INTEGER NOT NULL DEFAULT 0,revision_inline_bytes INTEGER NOT NULL DEFAULT 0,r2_ready_revision_bytes INTEGER NOT NULL DEFAULT 0,r2_ready_attachment_bytes INTEGER NOT NULL DEFAULT 0,r2_soft_deleted_bytes INTEGER NOT NULL DEFAULT 0,r2_pending_bytes INTEGER NOT NULL DEFAULT 0,r2_staging_import_bytes INTEGER NOT NULL DEFAULT 0,r2_orphan_estimate_bytes INTEGER NOT NULL DEFAULT 0,page_count INTEGER NOT NULL DEFAULT 0,revision_count INTEGER NOT NULL DEFAULT 0,attachment_count INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS site_state (id INTEGER PRIMARY KEY NOT NULL,active_wiki_id TEXT,bootstrap_status TEXT NOT NULL,reserved_by TEXT,reserved_at TEXT,lease_expires_at TEXT,last_error TEXT,version INTEGER NOT NULL,updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS site_runtime_settings (id INTEGER PRIMARY KEY NOT NULL,write_mode TEXT NOT NULL DEFAULT 'read_write',reason TEXT,updated_by TEXT,updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS storage_repairs (id TEXT PRIMARY KEY NOT NULL,wiki_id TEXT,object_key TEXT NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS import_sessions (id TEXT PRIMARY KEY NOT NULL,actor_email TEXT NOT NULL,manifest_hash TEXT NOT NULL,status TEXT NOT NULL,staging_wiki_id TEXT NOT NULL,completed_batches INTEGER NOT NULL DEFAULT 0,total_batches INTEGER NOT NULL,error_summary TEXT,created_at TEXT NOT NULL,expires_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS import_manifests (session_id TEXT PRIMARY KEY NOT NULL,manifest_json TEXT NOT NULL,created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS import_batches (session_id TEXT NOT NULL,batch_index INTEGER NOT NULL,expected_hash TEXT NOT NULL,received_hash TEXT,status TEXT NOT NULL,item_count INTEGER NOT NULL DEFAULT 0,size_bytes INTEGER NOT NULL DEFAULT 0,completed_at TEXT,PRIMARY KEY(session_id,batch_index))`,
  `CREATE TABLE IF NOT EXISTS backup_runs (id TEXT PRIMARY KEY NOT NULL,wiki_id TEXT NOT NULL,profile TEXT NOT NULL,status TEXT NOT NULL,manifest_hash TEXT,part_count INTEGER NOT NULL DEFAULT 0,acknowledged_at TEXT,created_at TEXT NOT NULL,completed_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS backup_manifests (backup_run_id TEXT PRIMARY KEY NOT NULL,manifest_json TEXT NOT NULL,created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS backup_revision_coverage (backup_run_id TEXT NOT NULL,revision_id TEXT NOT NULL,PRIMARY KEY(backup_run_id,revision_id))`,
];

function db(): D1Database {
  if (!env.DB)
    throw new AppError(
      "retryable_storage_error",
      "Wiki storage is not available.",
      503,
      {},
      true,
    );
  return env.DB;
}
const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const bytes = (value: string) => new TextEncoder().encode(value).byteLength;

export function ensureWikiSchema(): Promise<void> {
  schemaReady ??= (async () => {
    const d = db();
    await d.batch(schemaStatements.map((sql) => d.prepare(sql)));
    const pageColumns = await d
        .prepare("PRAGMA table_info(pages)")
        .all<{ name: string }>(),
      existing = new Set(pageColumns.results.map((column) => column.name)),
      additions = [
        ["source_url", "TEXT"],
        ["retrieval_status", "TEXT"],
        ["retrieved_at", "TEXT"],
        ["extraction_method", "TEXT"],
        ["confidence", "REAL"],
      ].filter(([name]) => !existing.has(name));
    for (const [name, type] of additions)
      await d.prepare(`ALTER TABLE pages ADD COLUMN ${name} ${type}`).run();
    for (const [table, columns] of [
      [
        "knowledge_maps",
        [
          ["overview_brief_json", "TEXT"],
          ["overview_brief_basis_hash", "TEXT"],
        ],
      ],
      [
        "knowledge_topics",
        [
          ["insight_brief_json", "TEXT"],
          ["insight_brief_basis_hash", "TEXT"],
        ],
      ],
    ] as const) {
      const info = await d
          .prepare(`PRAGMA table_info(${table})`)
          .all<{ name: string }>(),
        names = new Set(info.results.map((column) => column.name));
      for (const [name, type] of columns)
        if (!names.has(name))
          await d
            .prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`)
            .run();
    }
    await d
      .prepare(
        `INSERT OR IGNORE INTO site_state(id,bootstrap_status,version,updated_at) VALUES(1,'empty',1,?)`,
      )
      .bind(now())
      .run();
    await d
      .prepare(
        `INSERT OR IGNORE INTO site_runtime_settings(id,write_mode,updated_at) VALUES(1,'read_write',?)`,
      )
      .bind(now())
      .run();
  })();
  return schemaReady;
}

export async function getMembership(email: string): Promise<{
  wikiId: string | null;
  wikiSlug: string | null;
  wikiTitle: string | null;
  role: Role | null;
  bootstrapStatus: string;
  siteVersion: number;
  writeMode: WriteMode;
  writeModeReason: string | null;
  reservedBy: string | null;
}> {
  const state = await db()
    .prepare(
      `SELECT s.active_wiki_id,s.bootstrap_status,s.reserved_by,s.version AS site_version,COALESCE(rs.write_mode,'read_write') AS write_mode,rs.reason AS write_mode_reason FROM site_state s LEFT JOIN site_runtime_settings rs ON rs.id=1 WHERE s.id=1`,
    )
    .first<Record<string, unknown>>();
  const memberships = await db()
    .prepare(
      `SELECT w.id AS wiki_id,w.slug AS wiki_slug,w.title AS wiki_title,m.role,p.active_wiki_id AS preferred_wiki_id FROM wiki_members m JOIN wikis w ON w.id=m.wiki_id AND w.status='active' AND w.deleted_at IS NULL LEFT JOIN wiki_user_preferences p ON p.user_email=m.user_email WHERE m.user_email=? ORDER BY CASE WHEN p.active_wiki_id=w.id THEN 0 WHEN w.id=? THEN 1 ELSE 2 END,w.updated_at DESC`,
    )
    .bind(email, state?.active_wiki_id ?? null)
    .all<Record<string, unknown>>();
  const row = memberships.results[0];
  return {
    wikiId: typeof row?.wiki_id === "string" ? row.wiki_id : null,
    wikiSlug: typeof row?.wiki_slug === "string" ? row.wiki_slug : null,
    wikiTitle: typeof row?.wiki_title === "string" ? row.wiki_title : null,
    role: (row?.role as Role | undefined) ?? null,
    bootstrapStatus: String(state?.bootstrap_status ?? "empty"),
    siteVersion: Number(state?.site_version ?? 1),
    writeMode: state?.write_mode === "read_only" ? "read_only" : "read_write",
    writeModeReason:
      typeof state?.write_mode_reason === "string"
        ? state.write_mode_reason
        : null,
    reservedBy:
      typeof state?.reserved_by === "string" ? state.reserved_by : null,
  };
}

export async function setActiveWiki(input: { email: string; wikiId: string }) {
  const membership = await db()
    .prepare(
      `SELECT w.id,w.slug,w.title,w.status,m.role FROM wiki_members m JOIN wikis w ON w.id=m.wiki_id WHERE m.user_email=? AND w.id=? AND w.status='active' AND w.deleted_at IS NULL`,
    )
    .bind(input.email, input.wikiId)
    .first<Record<string, unknown>>();
  if (!membership)
    throw new AppError(
      "not_found",
      "The requested vault is not available to this account.",
      404,
      { wiki_id: input.wikiId },
    );
  await db()
    .prepare(
      `INSERT INTO wiki_user_preferences(user_email,active_wiki_id,updated_at) VALUES(?,?,?) ON CONFLICT(user_email) DO UPDATE SET active_wiki_id=excluded.active_wiki_id,updated_at=excluded.updated_at`,
    )
    .bind(input.email, input.wikiId, now())
    .run();
  return membership;
}

export async function setSiteWriteMode(input: {
  wikiId: string;
  email: string;
  writeMode: WriteMode;
  reason: string | null;
  requestId: string;
}) {
  const timestamp = now();
  await db().batch([
    db()
      .prepare(
        `UPDATE site_runtime_settings SET write_mode=?,reason=?,updated_by=?,updated_at=? WHERE id=1`,
      )
      .bind(
        input.writeMode,
        input.writeMode === "read_only" ? input.reason : null,
        input.email,
        timestamp,
      ),
    db()
      .prepare(
        `INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) VALUES(?,?,?,'human','site.write_mode','site',?,'success',?,?,?)`,
      )
      .bind(
        uuid(),
        input.wikiId,
        input.email,
        input.wikiId,
        input.requestId,
        JSON.stringify({
          write_mode: input.writeMode,
          reason: input.writeMode === "read_only" ? input.reason : null,
        }),
        timestamp,
      ),
  ]);
  return {
    write_mode: input.writeMode,
    reason: input.writeMode === "read_only" ? input.reason : null,
    updated_at: timestamp,
  };
}

export async function listAccessibleWikis(email: string) {
  const rows = await db()
    .prepare(
      `SELECT w.id,w.slug,w.title,w.status,m.role,w.created_at,w.updated_at FROM wiki_members m JOIN wikis w ON w.id=m.wiki_id WHERE m.user_email=? AND w.deleted_at IS NULL ORDER BY w.updated_at DESC`,
    )
    .bind(email)
    .all();
  return rows.results;
}

export async function listWikiMembers(wikiId: string) {
  const rows = await db()
    .prepare(
      `SELECT user_email,role,created_at FROM wiki_members WHERE wiki_id=? ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END,user_email`,
    )
    .bind(wikiId)
    .all();
  return rows.results;
}

export async function upsertWikiMember(input: {
  wikiId: string;
  email: string;
  memberEmail: string;
  role: "editor" | "viewer";
  requestId: string;
}) {
  const memberEmail = input.memberEmail.trim().toLowerCase();
  if (!memberEmail || memberEmail.length > 320)
    throw new AppError(
      "validation_error",
      "A valid member email is required.",
      400,
      { field: "email" },
    );
  if (memberEmail === input.email)
    throw new AppError(
      "validation_error",
      "Use ownership transfer to change the owner role.",
      409,
      { field: "email" },
    );
  const existing = await db()
    .prepare(`SELECT role FROM wiki_members WHERE wiki_id=? AND user_email=?`)
    .bind(input.wikiId, memberEmail)
    .first<{ role: Role }>();
  if (existing?.role === "owner")
    throw new AppError(
      "validation_error",
      "The owner role can only change through ownership transfer.",
      409,
    );
  const timestamp = now();
  await db().batch([
    db()
      .prepare(
        `INSERT INTO wiki_members(wiki_id,user_email,role,created_at) VALUES(?,?,?,?) ON CONFLICT(wiki_id,user_email) DO UPDATE SET role=excluded.role`,
      )
      .bind(input.wikiId, memberEmail, input.role, timestamp),
    db()
      .prepare(
        `INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) VALUES(?,?,?,'human','member.upsert','member',?,'success',?,?,?)`,
      )
      .bind(
        uuid(),
        input.wikiId,
        input.email,
        memberEmail,
        input.requestId,
        JSON.stringify({
          previous_role: existing?.role ?? null,
          role: input.role,
        }),
        timestamp,
      ),
  ]);
  return { user_email: memberEmail, role: input.role, created_at: timestamp };
}

export async function removeWikiMember(input: {
  wikiId: string;
  email: string;
  memberEmail: string;
  requestId: string;
}) {
  const memberEmail = input.memberEmail.trim().toLowerCase(),
    existing = await db()
      .prepare(`SELECT role FROM wiki_members WHERE wiki_id=? AND user_email=?`)
      .bind(input.wikiId, memberEmail)
      .first<{ role: Role }>();
  if (!existing)
    throw new AppError("not_found", "The requested member was not found.", 404);
  if (existing.role === "owner")
    throw new AppError(
      "validation_error",
      "Transfer ownership before removing the current owner.",
      409,
    );
  const timestamp = now();
  await db().batch([
    db()
      .prepare(
        `DELETE FROM wiki_members WHERE wiki_id=? AND user_email=? AND role!='owner'`,
      )
      .bind(input.wikiId, memberEmail),
    db()
      .prepare(
        `INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) VALUES(?,?,?,'human','member.remove','member',?,'success',?,?,?)`,
      )
      .bind(
        uuid(),
        input.wikiId,
        input.email,
        memberEmail,
        input.requestId,
        JSON.stringify({ previous_role: existing.role }),
        timestamp,
      ),
  ]);
  return { user_email: memberEmail, removed: true };
}

export async function transferWikiOwnership(input: {
  wikiId: string;
  email: string;
  memberEmail: string;
  confirmation: string;
  requestId: string;
}) {
  const memberEmail = input.memberEmail.trim().toLowerCase();
  if (input.confirmation !== `TRANSFER ${memberEmail}`)
    throw new AppError(
      "validation_error",
      `Type TRANSFER ${memberEmail} to confirm ownership transfer.`,
      400,
      { field: "confirmation" },
    );
  if (memberEmail === input.email)
    throw new AppError(
      "validation_error",
      "This user already owns the wiki.",
      409,
    );
  const target = await db()
    .prepare(`SELECT role FROM wiki_members WHERE wiki_id=? AND user_email=?`)
    .bind(input.wikiId, memberEmail)
    .first<{ role: Role }>();
  if (!target)
    throw new AppError(
      "not_found",
      "Add the new owner as a member before transferring ownership.",
      404,
    );
  const timestamp = now();
  await db().batch([
    db()
      .prepare(
        `UPDATE wiki_members SET role='editor' WHERE wiki_id=? AND user_email=? AND role='owner'`,
      )
      .bind(input.wikiId, input.email),
    db()
      .prepare(
        `UPDATE wiki_members SET role='owner' WHERE wiki_id=? AND user_email=? AND role!='owner'`,
      )
      .bind(input.wikiId, memberEmail),
    db()
      .prepare(
        `INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) VALUES(?,?,?,'human','member.transfer_ownership','member',?,'success',?,?,?)`,
      )
      .bind(
        uuid(),
        input.wikiId,
        input.email,
        memberEmail,
        input.requestId,
        JSON.stringify({ previous_owner: input.email }),
        timestamp,
      ),
  ]);
  return { owner: memberEmail, previous_owner: input.email };
}

export async function listAuditEvents(wikiId: string, limit: number) {
  const rows = await db()
    .prepare(
      `SELECT id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at FROM audit_events WHERE wiki_id=? ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(wikiId, limit)
    .all();
  return rows.results.map((row) => ({
    ...row,
    metadata: JSON.parse(String(row.metadata_json ?? "{}")),
    metadata_json: undefined,
  }));
}

async function ensureWebMcpTelemetrySchema() {
  telemetrySchemaReady ??= (async () => {
    const d = db();
    await d
      .prepare(
        `CREATE TABLE IF NOT EXISTS webmcp_tool_metrics (wiki_id TEXT NOT NULL,tool_name TEXT NOT NULL,outcome TEXT NOT NULL,invocation_count INTEGER NOT NULL DEFAULT 0,total_latency_ms INTEGER NOT NULL DEFAULT 0,max_latency_ms INTEGER NOT NULL DEFAULT 0,last_latency_ms INTEGER NOT NULL DEFAULT 0,last_correlation_id TEXT NOT NULL,last_invoked_at TEXT NOT NULL,PRIMARY KEY(wiki_id,tool_name,outcome))`,
      )
      .run();
    await d
      .prepare(
        `CREATE TABLE IF NOT EXISTS api_request_metrics (command_name TEXT NOT NULL,outcome TEXT NOT NULL,request_count INTEGER NOT NULL DEFAULT 0,total_latency_ms INTEGER NOT NULL DEFAULT 0,max_latency_ms INTEGER NOT NULL DEFAULT 0,last_latency_ms INTEGER NOT NULL DEFAULT 0,last_request_id TEXT NOT NULL,last_requested_at TEXT NOT NULL,PRIMARY KEY(command_name,outcome))`,
      )
      .run();
    await d
      .prepare(
        `CREATE TABLE IF NOT EXISTS api_command_measurements (command_name TEXT PRIMARY KEY NOT NULL,result_sample_count INTEGER NOT NULL DEFAULT 0,total_result_count INTEGER NOT NULL DEFAULT 0,max_result_count INTEGER NOT NULL DEFAULT 0,last_result_count INTEGER NOT NULL DEFAULT 0,size_sample_count INTEGER NOT NULL DEFAULT 0,total_size_bytes INTEGER NOT NULL DEFAULT 0,max_size_bytes INTEGER NOT NULL DEFAULT 0,last_size_bytes INTEGER NOT NULL DEFAULT 0,last_measured_at TEXT NOT NULL)`,
      )
      .run();
  })();
  return telemetrySchemaReady;
}

export async function recordApiRequestMetric(input: {
  commandName: string;
  outcome: string;
  latencyMs: number;
  requestId: string;
  resultCount?: number;
  sizeBytes?: number;
}) {
  await ensureWebMcpTelemetrySchema();
  const timestamp = now(),
    d = db(),
    statements = [
      d
        .prepare(
          `INSERT INTO api_request_metrics(command_name,outcome,request_count,total_latency_ms,max_latency_ms,last_latency_ms,last_request_id,last_requested_at) VALUES(?,?,1,?,?,?,?,?) ON CONFLICT(command_name,outcome) DO UPDATE SET request_count=request_count+1,total_latency_ms=total_latency_ms+excluded.last_latency_ms,max_latency_ms=MAX(max_latency_ms,excluded.last_latency_ms),last_latency_ms=excluded.last_latency_ms,last_request_id=excluded.last_request_id,last_requested_at=excluded.last_requested_at`,
        )
        .bind(
          input.commandName,
          input.outcome,
          input.latencyMs,
          input.latencyMs,
          input.latencyMs,
          input.requestId,
          timestamp,
        ),
    ];
  if (input.resultCount !== undefined || input.sizeBytes !== undefined) {
    const resultSample = input.resultCount === undefined ? 0 : 1,
      resultCount = input.resultCount ?? 0,
      sizeSample = input.sizeBytes === undefined ? 0 : 1,
      sizeBytes = input.sizeBytes ?? 0;
    statements.push(
      d
        .prepare(
          `INSERT INTO api_command_measurements(command_name,result_sample_count,total_result_count,max_result_count,last_result_count,size_sample_count,total_size_bytes,max_size_bytes,last_size_bytes,last_measured_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(command_name) DO UPDATE SET result_sample_count=result_sample_count+excluded.result_sample_count,total_result_count=total_result_count+excluded.total_result_count,max_result_count=MAX(max_result_count,excluded.max_result_count),last_result_count=CASE WHEN excluded.result_sample_count=1 THEN excluded.last_result_count ELSE last_result_count END,size_sample_count=size_sample_count+excluded.size_sample_count,total_size_bytes=total_size_bytes+excluded.total_size_bytes,max_size_bytes=MAX(max_size_bytes,excluded.max_size_bytes),last_size_bytes=CASE WHEN excluded.size_sample_count=1 THEN excluded.last_size_bytes ELSE last_size_bytes END,last_measured_at=excluded.last_measured_at`,
        )
        .bind(
          input.commandName,
          resultSample,
          resultCount,
          resultCount,
          resultCount,
          sizeSample,
          sizeBytes,
          sizeBytes,
          sizeBytes,
          timestamp,
        ),
    );
  }
  await d.batch(statements);
}

export async function recordWebMcpInvocation(input: {
  wikiId: string;
  toolName: string;
  outcome: string;
  latencyMs: number;
  correlationId: string;
}) {
  await ensureWebMcpTelemetrySchema();
  const timestamp = now();
  await db()
    .prepare(
      `INSERT INTO webmcp_tool_metrics(wiki_id,tool_name,outcome,invocation_count,total_latency_ms,max_latency_ms,last_latency_ms,last_correlation_id,last_invoked_at) VALUES(?,?,?,1,?,?,?,?,?) ON CONFLICT(wiki_id,tool_name,outcome) DO UPDATE SET invocation_count=invocation_count+1,total_latency_ms=total_latency_ms+excluded.last_latency_ms,max_latency_ms=MAX(max_latency_ms,excluded.last_latency_ms),last_latency_ms=excluded.last_latency_ms,last_correlation_id=excluded.last_correlation_id,last_invoked_at=excluded.last_invoked_at`,
    )
    .bind(
      input.wikiId,
      input.toolName,
      input.outcome,
      input.latencyMs,
      input.latencyMs,
      input.latencyMs,
      input.correlationId,
      timestamp,
    )
    .run();
}

export async function getOperationsSummary(wikiId: string) {
  await ensureWebMcpTelemetrySchema();
  const usage = await db()
    .prepare(
      `SELECT page_bytes,revision_inline_bytes,r2_ready_revision_bytes,r2_ready_attachment_bytes,r2_soft_deleted_bytes,r2_pending_bytes,r2_staging_import_bytes,r2_orphan_estimate_bytes,page_count,revision_count,attachment_count,updated_at FROM wiki_usage WHERE wiki_id=?`,
    )
    .bind(wikiId)
    .first();
  const latestBackup = await db()
    .prepare(
      `SELECT id,profile,status,part_count,acknowledged_at,created_at,completed_at FROM backup_runs WHERE wiki_id=? ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(wikiId)
    .first();
  const latestFullBackup = await db()
    .prepare(
      `SELECT id,profile,status,part_count,acknowledged_at,created_at,completed_at FROM backup_runs WHERE wiki_id=? AND profile='full' AND acknowledged_at IS NOT NULL ORDER BY acknowledged_at DESC LIMIT 1`,
    )
    .bind(wikiId)
    .first();
  const pendingRepairs = await db()
    .prepare(
      `SELECT COUNT(*) AS count FROM storage_repairs WHERE wiki_id=? AND status='pending'`,
    )
    .bind(wikiId)
    .first<{ count: number }>();
  const webmcpMetrics = await db()
    .prepare(
      `SELECT tool_name,outcome,invocation_count,ROUND(CAST(total_latency_ms AS REAL)/MAX(invocation_count,1)) AS average_latency_ms,max_latency_ms,last_latency_ms,last_correlation_id,last_invoked_at FROM webmcp_tool_metrics WHERE wiki_id=? ORDER BY last_invoked_at DESC,tool_name,outcome`,
    )
    .bind(wikiId)
    .all();
  const apiMetrics = await db()
    .prepare(
      `SELECT command_name,outcome,request_count,ROUND(CAST(total_latency_ms AS REAL)/MAX(request_count,1)) AS average_latency_ms,max_latency_ms,last_latency_ms,last_request_id,last_requested_at FROM api_request_metrics ORDER BY last_requested_at DESC,command_name,outcome`,
    )
    .all();
  const apiMeasurements = await db()
    .prepare(
      `SELECT command_name,result_sample_count,total_result_count,ROUND(CAST(total_result_count AS REAL)/MAX(result_sample_count,1),1) AS average_result_count,max_result_count,last_result_count,size_sample_count,total_size_bytes,ROUND(CAST(total_size_bytes AS REAL)/MAX(size_sample_count,1)) AS average_size_bytes,max_size_bytes,last_size_bytes,last_measured_at FROM api_command_measurements ORDER BY last_measured_at DESC,command_name`,
    )
    .all();
  return {
    usage: usage ?? null,
    latest_backup: latestBackup ?? null,
    latest_acknowledged_full_backup: latestFullBackup ?? null,
    pending_repairs: Number(pendingRepairs?.count ?? 0),
    webmcp_metrics: webmcpMetrics.results,
    api_metrics: apiMetrics.results,
    api_measurements: apiMeasurements.results,
  };
}

export async function probeD1AtomicBatch(input: {
  wikiId: string;
  email: string;
  requestId: string;
}) {
  const d = db(),
    operationId = uuid(),
    timestamp = now(),
    expiresAt = new Date(Date.now() + 60_000).toISOString();
  let batchRejected = false;
  try {
    await d.batch([
      d
        .prepare(
          `INSERT INTO idempotency_keys(wiki_id,actor_email,operation_id,operation_name,request_hash,request_id,status,lease_expires_at,attempts,created_at,expires_at) VALUES(?,?,?,'runtime_atomicity_probe','first',?,'pending',?,1,?,?)`,
        )
        .bind(
          input.wikiId,
          input.email,
          operationId,
          input.requestId,
          expiresAt,
          timestamp,
          expiresAt,
        ),
      d
        .prepare(
          `INSERT INTO idempotency_keys(wiki_id,actor_email,operation_id,operation_name,request_hash,request_id,status,lease_expires_at,attempts,created_at,expires_at) VALUES(?,?,?,'runtime_atomicity_probe','duplicate',?,'pending',?,1,?,?)`,
        )
        .bind(
          input.wikiId,
          input.email,
          operationId,
          input.requestId,
          expiresAt,
          timestamp,
          expiresAt,
        ),
    ]);
  } catch {
    batchRejected = true;
  }
  const partial = await d
    .prepare(
      `SELECT 1 AS present FROM idempotency_keys WHERE wiki_id=? AND actor_email=? AND operation_name='runtime_atomicity_probe' AND operation_id=?`,
    )
    .bind(input.wikiId, input.email, operationId)
    .first<{ present: number }>();
  if (partial)
    await d
      .prepare(
        `DELETE FROM idempotency_keys WHERE wiki_id=? AND actor_email=? AND operation_name='runtime_atomicity_probe' AND operation_id=?`,
      )
      .bind(input.wikiId, input.email, operationId)
      .run();
  const result = {
    atomic: batchRejected && !partial,
    batch_rejected: batchRejected,
    partial_commit_detected: Boolean(partial),
  };
  await d
    .prepare(
      `INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) VALUES(?,?,?,'system','runtime.d1_atomicity_probe','wiki',?,?,?, ?,?)`,
    )
    .bind(
      uuid(),
      input.wikiId,
      input.email,
      input.wikiId,
      result.atomic ? "success" : "error",
      input.requestId,
      JSON.stringify(result),
      timestamp,
    )
    .run();
  return result;
}

export async function bootstrapWiki(input: {
  email: string;
  title: string;
  expectedVersion: number;
  requestId: string;
}) {
  const d = db(),
    timestamp = now(),
    wikiId = uuid(),
    slug = `wiki-${wikiId.slice(0, 8)}`;
  const reservation = await d
    .prepare(
      `UPDATE site_state SET bootstrap_status='reserved',reserved_by=?,reserved_at=?,lease_expires_at=?,version=version+1,updated_at=? WHERE id=1 AND bootstrap_status='empty' AND version=?`,
    )
    .bind(
      input.email,
      timestamp,
      new Date(Date.now() + 60_000).toISOString(),
      timestamp,
      input.expectedVersion,
    )
    .run();
  if ((reservation.meta.changes ?? 0) !== 1)
    throw new AppError(
      "validation_error",
      "This Site already has an active or reserved wiki.",
      409,
    );
  try {
    await d.batch([
      d
        .prepare(
          `INSERT INTO wikis(id,slug,title,status,created_at,updated_at) VALUES(?,?,?,'active',?,?)`,
        )
        .bind(wikiId, slug, input.title, timestamp, timestamp),
      d
        .prepare(
          `INSERT INTO wiki_members(wiki_id,user_email,role,created_at) VALUES(?,?,'owner',?)`,
        )
        .bind(wikiId, input.email, timestamp),
      d
        .prepare(`INSERT INTO wiki_usage(wiki_id,updated_at) VALUES(?,?)`)
        .bind(wikiId, timestamp),
      d
        .prepare(
          `INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) VALUES(?,?,?,'human','wiki.bootstrap','wiki',?,'success',?,'{}',?)`,
        )
        .bind(uuid(), wikiId, input.email, wikiId, input.requestId, timestamp),
      d
        .prepare(
          `UPDATE site_state SET active_wiki_id=?,bootstrap_status='active',reserved_by=NULL,reserved_at=NULL,lease_expires_at=NULL,version=version+1,updated_at=? WHERE id=1 AND bootstrap_status='reserved' AND reserved_by=?`,
        )
        .bind(wikiId, timestamp, input.email),
    ]);
    return { id: wikiId, slug, title: input.title, role: "owner" as const };
  } catch (error) {
    await d
      .prepare(
        `UPDATE site_state SET bootstrap_status='empty',reserved_by=NULL,reserved_at=NULL,lease_expires_at=NULL,last_error='bootstrap_failed',version=version+1,updated_at=? WHERE id=1 AND bootstrap_status='reserved' AND reserved_by=?`,
      )
      .bind(now(), input.email)
      .run();
    throw error;
  }
}

export async function createWiki(input: {
  email: string;
  title: string;
  operationId: string;
  requestId: string;
}) {
  const d = db(),
    timestamp = now(),
    wikiId = input.operationId,
    slug = `vault-${wikiId.slice(0, 8)}`;
  const existing = await d
    .prepare(
      `SELECT w.id,w.slug,w.title,m.role FROM wikis w LEFT JOIN wiki_members m ON m.wiki_id=w.id AND m.user_email=? WHERE w.id=?`,
    )
    .bind(input.email, wikiId)
    .first<Record<string, unknown>>();
  if (existing) {
    if (existing.role === "owner" && existing.title === input.title)
      return existing;
    throw new AppError(
      "validation_error",
      "operation_id was already used with different vault input.",
      409,
      { operation_id: input.operationId },
    );
  }
  await d.batch([
    d
      .prepare(
        `INSERT INTO wikis(id,slug,title,status,created_at,updated_at) VALUES(?,?,?,'active',?,?)`,
      )
      .bind(wikiId, slug, input.title, timestamp, timestamp),
    d
      .prepare(
        `INSERT INTO wiki_members(wiki_id,user_email,role,created_at) VALUES(?,?,'owner',?)`,
      )
      .bind(wikiId, input.email, timestamp),
    d
      .prepare(`INSERT INTO wiki_usage(wiki_id,updated_at) VALUES(?,?)`)
      .bind(wikiId, timestamp),
    d
      .prepare(
        `INSERT INTO wiki_user_preferences(user_email,active_wiki_id,updated_at) VALUES(?,?,?) ON CONFLICT(user_email) DO UPDATE SET active_wiki_id=excluded.active_wiki_id,updated_at=excluded.updated_at`,
      )
      .bind(input.email, wikiId, timestamp),
    d
      .prepare(
        `INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) VALUES(?,?,?,'human','wiki.create','wiki',?,'success',?,'{}',?)`,
      )
      .bind(uuid(), wikiId, input.email, wikiId, input.requestId, timestamp),
  ]);
  return { id: wikiId, slug, title: input.title, role: "owner" as const };
}

export async function ensurePersonalWiki(input: { email: string }) {
  const d = db(),
    timestamp = now(),
    { auditId, wikiId } = await personalWikiIdentifiers(input.email),
    slug = `personal-${wikiId}`,
    title = "Liminal Wiki";
  await d.batch([
    d
      .prepare(
        `INSERT OR IGNORE INTO wikis(id,slug,title,status,created_at,updated_at) VALUES(?,?,?,'active',?,?)`,
      )
      .bind(wikiId, slug, title, timestamp, timestamp),
    d
      .prepare(
        `INSERT OR IGNORE INTO wiki_members(wiki_id,user_email,role,created_at) VALUES(?,?,'owner',?)`,
      )
      .bind(wikiId, input.email, timestamp),
    d
      .prepare(
        `INSERT OR IGNORE INTO wiki_usage(wiki_id,updated_at) VALUES(?,?)`,
      )
      .bind(wikiId, timestamp),
    d
      .prepare(
        `INSERT INTO wiki_user_preferences(user_email,active_wiki_id,updated_at) VALUES(?,?,?) ON CONFLICT(user_email) DO UPDATE SET active_wiki_id=excluded.active_wiki_id,updated_at=excluded.updated_at`,
      )
      .bind(input.email, wikiId, timestamp),
    d
      .prepare(
        `INSERT OR IGNORE INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) VALUES(?,?,?,'system','personal.auto_onboard','wiki',?,'success','personal.auto_onboard',?,?)`,
      )
      .bind(
        auditId,
        wikiId,
        input.email,
        wikiId,
        JSON.stringify({
          authentication: "chatgpt_required",
          policy: "isolated_personal_wiki",
          role: "owner",
        }),
        timestamp,
      ),
  ]);
  const membership = await d
    .prepare(
      `SELECT w.id,w.slug,w.title,m.role FROM wikis w JOIN wiki_members m ON m.wiki_id=w.id WHERE w.id=? AND m.user_email=? AND w.status='active' AND w.deleted_at IS NULL`,
    )
    .bind(wikiId, input.email)
    .first<Record<string, unknown>>();
  if (!membership || membership.role !== "owner")
    throw new AppError(
      "internal_error",
      "The personal wiki could not be prepared.",
      500,
    );
  return membership;
}

export async function upgradeLegacyDemoWiki(input: {
  email: string;
  wikiId: string;
}) {
  const d = db(),
    timestamp = now(),
    legacySlug = `demo-${input.wikiId.slice(0, 8)}`,
    personalSlug = `personal-${input.wikiId}`,
    { upgradeAuditId } = await personalWikiIdentifiers(input.email),
    existing = await d
      .prepare(
        `SELECT w.id,w.slug,w.title,m.role,(SELECT COUNT(*) FROM wiki_members all_members WHERE all_members.wiki_id=w.id) AS member_count FROM wikis w JOIN wiki_members m ON m.wiki_id=w.id AND m.user_email=? WHERE w.id=? AND w.status='active' AND w.deleted_at IS NULL`,
      )
      .bind(input.email, input.wikiId)
      .first<Record<string, unknown>>();
  if (!existing)
    throw new AppError(
      "not_found",
      "The legacy wiki membership could not be found.",
      404,
    );
  if (!isLegacyPublicDemoSlug(existing.slug)) return existing;
  if (existing.slug !== legacySlug || Number(existing.member_count) !== 1)
    throw new AppError(
      "internal_error",
      "The legacy isolated wiki could not be upgraded safely.",
      500,
    );
  await d.batch([
    d
      .prepare(
        `UPDATE wikis SET slug=?,title=CASE WHEN title='WebMCP Demo' THEN 'Liminal Wiki' ELSE title END,updated_at=? WHERE id=? AND slug=?`,
      )
      .bind(personalSlug, timestamp, input.wikiId, legacySlug),
    d
      .prepare(
        `UPDATE wiki_members SET role='owner' WHERE wiki_id=? AND user_email=?`,
      )
      .bind(input.wikiId, input.email),
    d
      .prepare(
        `INSERT INTO wiki_user_preferences(user_email,active_wiki_id,updated_at) VALUES(?,?,?) ON CONFLICT(user_email) DO UPDATE SET active_wiki_id=excluded.active_wiki_id,updated_at=excluded.updated_at`,
      )
      .bind(input.email, input.wikiId, timestamp),
    d
      .prepare(
        `INSERT OR IGNORE INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) VALUES(?,?,?,'system','personal.upgrade_legacy_demo','wiki',?,'success','personal.upgrade_legacy_demo',?,?)`,
      )
      .bind(
        upgradeAuditId,
        input.wikiId,
        input.email,
        input.wikiId,
        JSON.stringify({
          authentication: "chatgpt_required",
          from_role: existing.role,
          policy: "isolated_personal_wiki",
          to_role: "owner",
        }),
        timestamp,
      ),
  ]);
  const upgraded = await d
    .prepare(
      `SELECT w.id,w.slug,w.title,m.role FROM wikis w JOIN wiki_members m ON m.wiki_id=w.id AND m.user_email=? WHERE w.id=? AND w.status='active' AND w.deleted_at IS NULL`,
    )
    .bind(input.email, input.wikiId)
    .first<Record<string, unknown>>();
  if (!upgraded || upgraded.slug !== personalSlug || upgraded.role !== "owner")
    throw new AppError(
      "internal_error",
      "The legacy wiki upgrade did not complete.",
      500,
    );
  return upgraded;
}

type PageRow = {
  id: string;
  wiki_id: string;
  parent_id: string | null;
  slug: string;
  title: string;
  page_type: PageType;
  markdown: string;
  source_url: string | null;
  retrieval_status: RetrievalStatus | null;
  retrieved_at: string | null;
  extraction_method: string | null;
  confidence: number | null;
  version: number;
  sort_order: number;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
};
const PAGE_COLUMNS =
  "id,wiki_id,parent_id,slug,title,page_type,markdown,source_url,retrieval_status,retrieved_at,extraction_method,confidence,version,sort_order,created_by,updated_by,created_at,updated_at,deleted_at";
async function pagePath(row: PageRow): Promise<string> {
  const segments = [row.slug];
  let parent = row.parent_id;
  for (let i = 0; parent && i < 64; i++) {
    const found = await db()
      .prepare(
        `SELECT parent_id,slug FROM pages WHERE id=? AND wiki_id=? AND deleted_at IS NULL`,
      )
      .bind(parent, row.wiki_id)
      .first<{ parent_id: string | null; slug: string }>();
    if (!found) break;
    segments.unshift(found.slug);
    parent = found.parent_id;
  }
  return `/${segments.join("/")}`;
}
async function mapPage(row: PageRow): Promise<WikiPage> {
  return { ...row, path: await pagePath(row) };
}

export async function listPages(
  wikiId: string,
  parentId: string | null = null,
  limit = 100,
  depth = 0,
  offset = 0,
) {
  if (depth === 0) {
    const result = await db()
      .prepare(
        `SELECT ${PAGE_COLUMNS} FROM pages WHERE wiki_id=? AND deleted_at IS NULL AND ((? IS NULL AND parent_id IS NULL) OR parent_id=?) ORDER BY sort_order,title,id LIMIT ? OFFSET ?`,
      )
      .bind(wikiId, parentId, parentId, limit, offset)
      .all<PageRow>();
    return Promise.all(result.results.map(mapPage));
  }
  const all = await db()
      .prepare(
        `SELECT ${PAGE_COLUMNS} FROM pages WHERE wiki_id=? AND deleted_at IS NULL ORDER BY sort_order,title,id LIMIT 2000`,
      )
      .bind(wikiId)
      .all<PageRow>(),
    selected: PageRow[] = [],
    queue = all.results
      .filter((page) => page.parent_id === parentId)
      .map((page) => ({ page, level: 0 }));
  while (queue.length && selected.length < Math.min(2000, offset + limit)) {
    const current = queue.shift()!;
    selected.push(current.page);
    if (current.level < depth)
      for (const child of all.results.filter(
        (page) => page.parent_id === current.page.id,
      ))
        queue.push({ page: child, level: current.level + 1 });
  }
  return Promise.all(selected.slice(offset, offset + limit).map(mapPage));
}
export async function countPagesForList(
  wikiId: string,
  parentId: string | null,
  depth = 0,
) {
  if (depth === 0) {
    const row = await db()
      .prepare(
        `SELECT COUNT(*) AS total FROM pages WHERE wiki_id=? AND deleted_at IS NULL AND ((? IS NULL AND parent_id IS NULL) OR parent_id=?)`,
      )
      .bind(wikiId, parentId, parentId)
      .first<{ total: number }>();
    return Number(row?.total ?? 0);
  }
  return (await listPages(wikiId, parentId, 2000, depth, 0)).length;
}
export async function listDeletedPages(wikiId: string, limit = 100) {
  const result = await db()
    .prepare(
      `SELECT ${PAGE_COLUMNS} FROM pages WHERE wiki_id=? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT ?`,
    )
    .bind(wikiId, limit)
    .all<PageRow>();
  return Promise.all(result.results.map(mapPage));
}
export async function getPage(wikiId: string, pageId: string) {
  const row = await db()
    .prepare(
      `SELECT ${PAGE_COLUMNS} FROM pages WHERE id=? AND wiki_id=? AND deleted_at IS NULL`,
    )
    .bind(pageId, wikiId)
    .first<PageRow>();
  if (!row)
    throw new AppError("not_found", "The requested page was not found.", 404, {
      page_id: pageId,
    });
  return mapPage(row);
}
async function getPageIncludingDeleted(wikiId: string, pageId: string) {
  const row = await db()
    .prepare(`SELECT ${PAGE_COLUMNS} FROM pages WHERE id=? AND wiki_id=?`)
    .bind(pageId, wikiId)
    .first<PageRow>();
  if (!row)
    throw new AppError("not_found", "The requested page was not found.", 404, {
      page_id: pageId,
    });
  return row;
}

async function reserveIdempotency(input: {
  wikiId: string;
  email: string;
  operationId: string;
  operationName: string;
  payload: unknown;
  requestId: string;
}) {
  const d = db(),
    requestHash = await sha256(stableJson(input.payload)),
    timestamp = now(),
    lease = new Date(Date.now() + 30_000).toISOString(),
    expires = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const inserted = await d
    .prepare(
      `INSERT OR IGNORE INTO idempotency_keys(wiki_id,actor_email,operation_id,operation_name,request_hash,request_id,status,lease_expires_at,attempts,created_at,expires_at) VALUES(?,?,?,?,?,?,'pending',?,1,?,?)`,
    )
    .bind(
      input.wikiId,
      input.email,
      input.operationId,
      input.operationName,
      requestHash,
      input.requestId,
      lease,
      timestamp,
      expires,
    )
    .run();
  if ((inserted.meta.changes ?? 0) === 1) return { requestHash, cached: null };
  const existing = await d
    .prepare(
      `SELECT request_hash,status,result_json,lease_expires_at,failure_retryable FROM idempotency_keys WHERE wiki_id=? AND actor_email=? AND operation_name=? AND operation_id=?`,
    )
    .bind(input.wikiId, input.email, input.operationName, input.operationId)
    .first<{
      request_hash: string;
      status: string;
      result_json: string | null;
      lease_expires_at: string;
      failure_retryable: number | null;
    }>();
  if (!existing || existing.request_hash !== requestHash)
    throw new AppError(
      "validation_error",
      "operation_id was already used with different input.",
      409,
      { operation_id: input.operationId },
    );
  const disposition = idempotencyDisposition({
    status: existing.status,
    resultJson: existing.result_json,
    leaseExpiresAt: existing.lease_expires_at,
    failureRetryable: existing.failure_retryable,
  });
  if (disposition === "replay")
    return {
      requestHash,
      cached: JSON.parse(existing.result_json!) as Record<string, unknown>,
    };
  if (disposition === "reclaim") {
    const reclaimed = await d
      .prepare(
        `UPDATE idempotency_keys SET status='pending',request_id=?,lease_expires_at=?,failure_retryable=NULL,result_json=NULL,completed_at=NULL,attempts=attempts+1 WHERE wiki_id=? AND actor_email=? AND operation_name=? AND operation_id=? AND request_hash=? AND ((status='pending' AND lease_expires_at<=?) OR (status='failed' AND failure_retryable=1))`,
      )
      .bind(
        input.requestId,
        lease,
        input.wikiId,
        input.email,
        input.operationName,
        input.operationId,
        requestHash,
        timestamp,
      )
      .run();
    if ((reclaimed.meta.changes ?? 0) === 1)
      return { requestHash, cached: null };
  }
  if (disposition === "reject_failed") {
    const saved = JSON.parse(existing.result_json!) as {
      code: string;
      message: string;
      details?: Record<string, unknown>;
    };
    throw new AppError(
      saved.code as never,
      saved.message,
      409,
      saved.details ?? {},
    );
  }
  throw new AppError(
    "idempotency_pending",
    "The same operation is already in progress.",
    409,
    { operation_id: input.operationId },
    true,
  );
}

async function failIdempotency(input: {
  wikiId: string;
  email: string;
  operationId: string;
  operationName: string;
  error: AppError;
}) {
  await db()
    .prepare(
      `UPDATE idempotency_keys SET status='failed',failure_retryable=?,result_json=?,completed_at=? WHERE wiki_id=? AND actor_email=? AND operation_name=? AND operation_id=?`,
    )
    .bind(
      input.error.retryable ? 1 : 0,
      JSON.stringify({
        code: input.error.code,
        message: input.error.message,
        details: input.error.details,
      }),
      now(),
      input.wikiId,
      input.email,
      input.operationName,
      input.operationId,
    )
    .run();
}

async function snapshot(
  wikiId: string,
  pageId: string,
  version: number,
  markdown: string,
  operationId: string,
) {
  const hash = await sha256(markdown);
  if (bytes(markdown) <= INLINE_REVISION_BYTES)
    return { inline: markdown, key: null, hash, cleanup: async () => {} };
  const key = `revisions/${wikiId}/${pageId}/${version}-${operationId}.md`;
  if (!env.FILES)
    throw new AppError(
      "retryable_storage_error",
      "Large revision storage is unavailable.",
      503,
      {},
      true,
    );
  await env.FILES.put(key, markdown, {
    httpMetadata: { contentType: "text/markdown; charset=utf-8" },
    customMetadata: { sha256: hash },
  });
  const saved = await env.FILES.get(key);
  if (!saved || (await sha256(await saved.text())) !== hash) {
    await env.FILES.delete(key);
    throw new AppError(
      "retryable_storage_error",
      "The large revision checksum could not be verified.",
      503,
      {},
      true,
    );
  }
  return { inline: null, key, hash, cleanup: () => env.FILES.delete(key) };
}

type StoredSnapshot = Awaited<ReturnType<typeof snapshot>>;

async function compensateSnapshot(
  wikiId: string,
  snap: StoredSnapshot,
  reason: string,
) {
  if (!snap.key) return { deleted: true, repair_queued: false };
  try {
    await snap.cleanup();
    return { deleted: true, repair_queued: false };
  } catch (error) {
    try {
      const timestamp = now();
      await db()
        .prepare(
          `INSERT INTO storage_repairs(id,wiki_id,object_key,kind,status,last_error,created_at,updated_at) VALUES(?,?,?,'orphan_object','pending',?,?,?)`,
        )
        .bind(
          uuid(),
          wikiId,
          snap.key,
          `${reason}:${safeOperationalErrorTag(error)}`,
          timestamp,
          timestamp,
        )
        .run();
      return { deleted: false, repair_queued: true };
    } catch {
      return { deleted: false, repair_queued: false };
    }
  }
}

export async function probeRevisionCompensation(input: {
  wikiId: string;
  email: string;
  requestId: string;
}) {
  if (!env.FILES)
    throw new AppError(
      "retryable_storage_error",
      "Revision compensation diagnostics require R2.",
      503,
      {},
      true,
    );
  const direct = await snapshot(
      input.wikiId,
      `diagnostic-${uuid()}`,
      1,
      "x".repeat(INLINE_REVISION_BYTES + 1),
      uuid(),
    ),
    directResult = await compensateSnapshot(
      input.wikiId,
      direct,
      "diagnostic_direct_cleanup",
    ),
    directDeleted = direct.key ? !(await env.FILES.head(direct.key)) : false,
    queued = await snapshot(
      input.wikiId,
      `diagnostic-${uuid()}`,
      1,
      "y".repeat(INLINE_REVISION_BYTES + 1),
      uuid(),
    ),
    repairId = uuid(),
    timestamp = now();
  if (!queued.key)
    throw new AppError(
      "internal_error",
      "The diagnostic snapshot did not use R2.",
      500,
    );
  await db()
    .prepare(
      `INSERT INTO storage_repairs(id,wiki_id,object_key,kind,status,last_error,created_at,updated_at) VALUES(?,?,?,'orphan_object','pending','diagnostic_queued_repair',?,?)`,
    )
    .bind(repairId, input.wikiId, queued.key, timestamp, timestamp)
    .run();
  const repairResult = await processPendingStorageRepairs(input.wikiId),
    repair = await db()
      .prepare(`SELECT status FROM storage_repairs WHERE id=?`)
      .bind(repairId)
      .first<{ status: string }>(),
    queuedDeleted = !(await env.FILES.head(queued.key));
  await db()
    .prepare(
      `INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) VALUES(?,?,?,'human','diagnostic.revision_compensation','wiki',?,'success',?,?,?)`,
    )
    .bind(
      uuid(),
      input.wikiId,
      input.email,
      input.wikiId,
      input.requestId,
      JSON.stringify({
        direct_deleted: directDeleted,
        queued_deleted: queuedDeleted,
      }),
      timestamp,
    )
    .run();
  return {
    threshold_bytes: INLINE_REVISION_BYTES,
    direct_cleanup: directResult.deleted && directDeleted,
    queued_repair:
      repair?.status === "resolved" &&
      queuedDeleted &&
      repairResult.resolved_repairs >= 1,
  };
}

export async function probeWikiIsolation(input: {
  wikiId: string;
  email: string;
  requestId: string;
}) {
  const d = db(),
    foreignWikiId = uuid(),
    foreignPageId = uuid(),
    foreignAttachmentId = uuid(),
    timestamp = now(),
    suffix = foreignWikiId.slice(0, 8);
  let pageLookupBlocked = false,
    attachmentLookupBlocked = false,
    listFiltered = false;
  try {
    await d.batch([
      d
        .prepare(
          `INSERT INTO wikis(id,slug,title,status,created_at,updated_at) VALUES(?,?,?,'active',?,?)`,
        )
        .bind(
          foreignWikiId,
          `diagnostic-${suffix}`,
          "Cross-wiki isolation diagnostic",
          timestamp,
          timestamp,
        ),
      d
        .prepare(
          `INSERT INTO pages(id,wiki_id,parent_id,parent_key,slug,title,page_type,markdown,version,sort_order,created_by,updated_by,created_at,updated_at) VALUES(?,?,NULL,?,?,?,'note','diagnostic',1,0,?,?,?,?)`,
        )
        .bind(
          foreignPageId,
          foreignWikiId,
          ROOT_PARENT,
          `foreign-${suffix}`,
          "Foreign diagnostic page",
          input.email,
          input.email,
          timestamp,
          timestamp,
        ),
      d
        .prepare(
          `INSERT INTO attachments(id,wiki_id,page_id,object_key,filename,mime_type,size_bytes,sha256,uploaded_by,status,created_at) VALUES(?,?,?,?,?,'application/octet-stream',1,?,?,'ready',?)`,
        )
        .bind(
          foreignAttachmentId,
          foreignWikiId,
          foreignPageId,
          `diagnostics/cross-wiki/${foreignAttachmentId}`,
          "foreign.bin",
          "0".repeat(64),
          input.email,
          timestamp,
        ),
    ]);
    try {
      await getPage(input.wikiId, foreignPageId);
    } catch (error) {
      pageLookupBlocked =
        error instanceof AppError &&
        error.code === "not_found" &&
        error.status === 404;
    }
    try {
      await getAttachment(input.wikiId, foreignAttachmentId);
    } catch (error) {
      attachmentLookupBlocked =
        error instanceof AppError &&
        error.code === "not_found" &&
        error.status === 404;
    }
    listFiltered = !(await listPages(input.wikiId, null, 2000, 64)).some(
      (page) => page.id === foreignPageId,
    );
  } finally {
    await d.batch([
      d.prepare(`DELETE FROM attachments WHERE id=?`).bind(foreignAttachmentId),
      d.prepare(`DELETE FROM pages WHERE id=?`).bind(foreignPageId),
      d.prepare(`DELETE FROM wikis WHERE id=?`).bind(foreignWikiId),
    ]);
  }
  const result = {
    page_lookup_blocked: pageLookupBlocked,
    attachment_lookup_blocked: attachmentLookupBlocked,
    list_filtered: listFiltered,
  };
  await d
    .prepare(
      `INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) VALUES(?,?,?,'human','diagnostic.cross_wiki_isolation','wiki',?,?,?,?,?)`,
    )
    .bind(
      uuid(),
      input.wikiId,
      input.email,
      input.wikiId,
      Object.values(result).every(Boolean) ? "success" : "error",
      input.requestId,
      JSON.stringify(result),
      now(),
    )
    .run();
  return result;
}

export async function probeMissingRevisionGuard(input: {
  wikiId: string;
  email: string;
  requestId: string;
}) {
  if (!env.FILES)
    throw new AppError(
      "retryable_storage_error",
      "Missing revision diagnostics require R2.",
      503,
      {},
      true,
    );
  const d = db(),
    pageId = uuid(),
    revisionId = uuid(),
    operationId = uuid(),
    timestamp = now(),
    markdown = "m".repeat(INLINE_REVISION_BYTES + 1),
    snap = await snapshot(input.wikiId, pageId, 1, markdown, operationId);
  if (!snap.key)
    throw new AppError(
      "internal_error",
      "The missing revision diagnostic did not use R2.",
      500,
    );
  let backupReadRejected = false,
    restoreReadRejected = false,
    markedMissing = false,
    unavailableAfterMark = false;
  try {
    await d.batch([
      d
        .prepare(
          `INSERT INTO pages(id,wiki_id,parent_id,parent_key,slug,title,page_type,markdown,version,sort_order,created_by,updated_by,created_at,updated_at) VALUES(?,?,NULL,?,?,?,'note','diagnostic',1,0,?,?,?,?)`,
        )
        .bind(
          pageId,
          input.wikiId,
          ROOT_PARENT,
          `missing-${pageId.slice(0, 8)}`,
          "Missing revision diagnostic",
          input.email,
          input.email,
          timestamp,
          timestamp,
        ),
      d
        .prepare(
          `INSERT INTO page_revisions(id,page_id,version,snapshot_inline,snapshot_object_key,content_sha256,change_summary,actor_email,origin,save_kind,operation_id,status,created_at) VALUES(?,?,1,NULL,?,?,?,?,'human','explicit',?,'ready',?)`,
        )
        .bind(
          revisionId,
          pageId,
          snap.key,
          snap.hash,
          "Missing revision diagnostic",
          input.email,
          operationId,
          timestamp,
        ),
    ]);
    await env.FILES.delete(snap.key);
    try {
      await readVerifiedRevisionObject(snap.key, snap.hash, {
        revision_id: revisionId,
      });
    } catch (error) {
      backupReadRejected =
        error instanceof AppError &&
        error.code === "retryable_storage_error" &&
        error.status === 503;
    }
    try {
      await getRevisionSnapshot(input.wikiId, pageId, 1);
    } catch (error) {
      restoreReadRejected =
        error instanceof AppError &&
        error.code === "retryable_storage_error" &&
        error.status === 503;
    }
    markedMissing =
      (
        await d
          .prepare(`SELECT status FROM page_revisions WHERE id=?`)
          .bind(revisionId)
          .first<{ status: string }>()
      )?.status === "missing";
    try {
      await getRevisionSnapshot(input.wikiId, pageId, 1);
    } catch (error) {
      unavailableAfterMark =
        error instanceof AppError &&
        error.code === "not_found" &&
        error.status === 410;
    }
  } finally {
    await env.FILES.delete(snap.key);
    await d.batch([
      d.prepare(`DELETE FROM page_revisions WHERE id=?`).bind(revisionId),
      d.prepare(`DELETE FROM pages WHERE id=?`).bind(pageId),
    ]);
  }
  const result = {
    backup_read_rejected: backupReadRejected,
    restore_read_rejected: restoreReadRejected,
    marked_missing: markedMissing,
    unavailable_after_mark: unavailableAfterMark,
  };
  await d
    .prepare(
      `INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) VALUES(?,?,?,'human','diagnostic.missing_revision_guard','wiki',?,?,?,?,?)`,
    )
    .bind(
      uuid(),
      input.wikiId,
      input.email,
      input.wikiId,
      Object.values(result).every(Boolean) ? "success" : "error",
      input.requestId,
      JSON.stringify(result),
      now(),
    )
    .run();
  return result;
}

export async function probeAttachmentPurge(input: {
  wikiId: string;
  email: string;
  requestId: string;
}) {
  if (!env.FILES)
    throw new AppError(
      "retryable_storage_error",
      "Attachment purge diagnostics require R2.",
      503,
      {},
      true,
    );
  const d = db(),
    attachmentId = uuid(),
    key = `attachments/${input.wikiId}/diagnostic-${attachmentId}`,
    data = new Uint8Array([1]).buffer,
    timestamp = now(),
    expiredAt = new Date(Date.now() - 31 * 86_400_000).toISOString();
  let statusDeleted = false,
    objectDeleted = false,
    countedOnce = false;
  await env.FILES.put(key, data, {
    httpMetadata: { contentType: "application/octet-stream" },
    customMetadata: { sha256: await sha256Bytes(data) },
  });
  try {
    await d.batch([
      d
        .prepare(
          `INSERT INTO attachments(id,wiki_id,page_id,object_key,filename,mime_type,size_bytes,sha256,uploaded_by,status,created_at,deleted_at) VALUES(?,?,NULL,?,?,?,1,?,?,'soft_deleted',?,?)`,
        )
        .bind(
          attachmentId,
          input.wikiId,
          key,
          "purge-diagnostic.bin",
          "application/octet-stream",
          await sha256Bytes(data),
          input.email,
          timestamp,
          expiredAt,
        ),
      d
        .prepare(
          `UPDATE wiki_usage SET r2_soft_deleted_bytes=r2_soft_deleted_bytes+1,updated_at=? WHERE wiki_id=?`,
        )
        .bind(timestamp, input.wikiId),
    ]);
    const purged = await purgeExpiredAttachments(
      input.wikiId,
      now(),
      attachmentId,
    );
    countedOnce = purged === 1;
    statusDeleted =
      (
        await d
          .prepare(`SELECT status FROM attachments WHERE id=?`)
          .bind(attachmentId)
          .first<{ status: string }>()
      )?.status === "deleted";
    objectDeleted = !(await env.FILES.head(key));
  } finally {
    const leftover = await d
      .prepare(`SELECT status FROM attachments WHERE id=?`)
      .bind(attachmentId)
      .first<{ status: string }>();
    if (leftover && leftover.status !== "deleted")
      await d
        .prepare(
          `UPDATE wiki_usage SET r2_soft_deleted_bytes=MAX(r2_soft_deleted_bytes-1,0),updated_at=? WHERE wiki_id=?`,
        )
        .bind(now(), input.wikiId)
        .run();
    await d
      .prepare(`DELETE FROM attachments WHERE id=?`)
      .bind(attachmentId)
      .run();
    await env.FILES.delete(key);
  }
  const result = {
    soft_deleted_to_deleted: statusDeleted,
    object_deleted: objectDeleted,
    counted_once: countedOnce,
  };
  await d
    .prepare(
      `INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) VALUES(?,?,?,'human','diagnostic.attachment_purge','wiki',?,?,?,?,?)`,
    )
    .bind(
      uuid(),
      input.wikiId,
      input.email,
      input.wikiId,
      Object.values(result).every(Boolean) ? "success" : "error",
      input.requestId,
      JSON.stringify(result),
      now(),
    )
    .run();
  return result;
}
async function assertContentQuota(
  wikiId: string,
  pageDelta: number,
  revisionBytes: number,
) {
  const usage = await db()
      .prepare(
        `SELECT u.page_bytes,u.revision_inline_bytes,u.r2_ready_revision_bytes,u.r2_ready_attachment_bytes,u.r2_soft_deleted_bytes,u.r2_pending_bytes,u.r2_staging_import_bytes,u.r2_orphan_estimate_bytes,u.page_count FROM wiki_usage u WHERE u.wiki_id=?`,
      )
      .bind(wikiId)
      .first<Record<string, number | string>>(),
    d1Used =
      Number(usage?.page_bytes ?? 0) +
      Number(usage?.revision_inline_bytes ?? 0),
    r2Used =
      Number(usage?.r2_ready_revision_bytes ?? 0) +
      Number(usage?.r2_ready_attachment_bytes ?? 0) +
      Number(usage?.r2_soft_deleted_bytes ?? 0) +
      Number(usage?.r2_pending_bytes ?? 0) +
      Number(usage?.r2_staging_import_bytes ?? 0) +
      Number(usage?.r2_orphan_estimate_bytes ?? 0),
    incomingD1 =
      Math.max(pageDelta, 0) +
      (revisionBytes <= INLINE_REVISION_BYTES ? revisionBytes : 0),
    incomingR2 = revisionBytes > INLINE_REVISION_BYTES ? revisionBytes : 0;
  if (d1Used + incomingD1 > D1_SOFT_LIMIT_BYTES * 0.95)
    throw new AppError(
      "quota_exceeded",
      "The D1 storage safety limit would be exceeded.",
      413,
      {
        used_bytes: d1Used,
        incoming_bytes: incomingD1,
        soft_limit_bytes: D1_SOFT_LIMIT_BYTES,
      },
    );
  if (r2Used + incomingR2 > R2_SOFT_LIMIT_BYTES * 0.95)
    throw new AppError(
      "quota_exceeded",
      "The R2 storage safety limit would be exceeded.",
      413,
      {
        used_bytes: r2Used,
        incoming_bytes: incomingR2,
        soft_limit_bytes: R2_SOFT_LIMIT_BYTES,
      },
    );
}

export async function createPage(input: {
  wikiId: string;
  email: string;
  title: string;
  pageType: PageType;
  markdown: string;
  parentId: string | null;
  operationId: string;
  requestId: string;
  origin: "human" | "webmcp";
  sourceUrl?: string | null;
  retrievalStatus?: RetrievalStatus | null;
  retrievedAt?: string | null;
  extractionMethod?: string | null;
  confidence?: number | null;
}): Promise<{ page_id: string; version: number; path: string; title: string }> {
  const operationName = "wiki_create_page",
    payload = {
      title: input.title,
      page_type: input.pageType,
      markdown: input.markdown,
      parent_id: input.parentId,
      source_url: input.sourceUrl ?? null,
      retrieval_status: input.retrievalStatus ?? null,
      retrieved_at: input.retrievedAt ?? null,
      extraction_method: input.extractionMethod ?? null,
      confidence: input.confidence ?? null,
    },
    reservation = await reserveIdempotency({
      ...input,
      operationName,
      payload,
    });
  if (reservation.cached)
    return reservation.cached as unknown as {
      page_id: string;
      version: number;
      path: string;
      title: string;
    };
  const d = db(),
    pageId = uuid(),
    timestamp = now(),
    slug = slugify(input.title),
    parentKey = input.parentId ?? ROOT_PARENT,
    frontmatter = JSON.stringify(parseFrontmatter(input.markdown));
  await assertContentQuota(
    input.wikiId,
    bytes(input.markdown),
    bytes(input.markdown),
  );
  if (input.parentId) {
    const parent = await getPage(input.wikiId, input.parentId);
    if (parent.page_type !== "folder")
      throw new AppError(
        "validation_error",
        "Pages and folders can only be created under a folder node.",
        400,
        { parent_id: input.parentId },
      );
  }
  const snap = await snapshot(
    input.wikiId,
    pageId,
    1,
    input.markdown,
    input.operationId,
  );
  const result = { page_id: pageId, version: 1, path: "", title: input.title };
  try {
    const statements = [
      d
        .prepare(
          `INSERT INTO pages(id,wiki_id,parent_id,parent_key,slug,title,page_type,markdown,source_url,retrieval_status,retrieved_at,extraction_method,confidence,frontmatter_json,version,sort_order,created_by,updated_by,last_operation_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,0,?,?,?,?,?)`,
        )
        .bind(
          pageId,
          input.wikiId,
          input.parentId,
          parentKey,
          slug,
          input.title,
          input.pageType,
          input.markdown,
          input.sourceUrl ?? null,
          input.retrievalStatus ?? null,
          input.retrievedAt ?? null,
          input.extractionMethod ?? null,
          input.confidence ?? null,
          frontmatter,
          input.email,
          input.email,
          input.operationId,
          timestamp,
          timestamp,
        ),
      d
        .prepare(
          `INSERT INTO page_revisions(id,page_id,version,snapshot_inline,snapshot_object_key,content_sha256,frontmatter_json,change_summary,actor_email,origin,save_kind,operation_id,status,created_at) VALUES(?,?,1,?,?,?,?,?,?,?,?,?,'ready',?)`,
        )
        .bind(
          uuid(),
          pageId,
          snap.inline,
          snap.key,
          snap.hash,
          frontmatter,
          "Page created",
          input.email,
          input.origin,
          input.origin === "webmcp" ? "webmcp" : "explicit",
          input.operationId,
          timestamp,
        ),
      ...extractWikiLinks(input.markdown).map((target) =>
        d
          .prepare(
            `INSERT INTO page_links(id,wiki_id,source_page_id,target_page_id,target_text,link_kind,created_at) VALUES(?,?,?,(SELECT CASE WHEN COUNT(*)=1 THEN MIN(id) ELSE NULL END FROM pages WHERE wiki_id=? AND title=? AND deleted_at IS NULL),?,'wikilink',?)`,
          )
          .bind(
            uuid(),
            input.wikiId,
            pageId,
            input.wikiId,
            target,
            target,
            timestamp,
          ),
      ),
      d
        .prepare(
          `UPDATE wiki_usage SET page_bytes=page_bytes+?,revision_inline_bytes=revision_inline_bytes+?,r2_ready_revision_bytes=r2_ready_revision_bytes+?,page_count=page_count+1,revision_count=revision_count+1,updated_at=? WHERE wiki_id=?`,
        )
        .bind(
          bytes(input.markdown),
          snap.inline ? bytes(input.markdown) : 0,
          snap.key ? bytes(input.markdown) : 0,
          timestamp,
          input.wikiId,
        ),
      d
        .prepare(
          `INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) VALUES(?,?,?,?, 'page.create','page',?,'success',?,?,?)`,
        )
        .bind(
          uuid(),
          input.wikiId,
          input.email,
          input.origin,
          pageId,
          input.requestId,
          JSON.stringify({ version: 1 }),
          timestamp,
        ),
      d
        .prepare(
          `UPDATE idempotency_keys SET status='completed',result_json=?,completed_at=? WHERE wiki_id=? AND actor_email=? AND operation_name=? AND operation_id=?`,
        )
        .bind(
          JSON.stringify(result),
          timestamp,
          input.wikiId,
          input.email,
          operationName,
          input.operationId,
        ),
    ];
    await d.batch(statements);
    result.path = await pagePath({
      id: pageId,
      wiki_id: input.wikiId,
      parent_id: input.parentId,
      slug,
      title: input.title,
      page_type: input.pageType,
      markdown: input.markdown,
      source_url: input.sourceUrl ?? null,
      retrieval_status: input.retrievalStatus ?? null,
      retrieved_at: input.retrievedAt ?? null,
      extraction_method: input.extractionMethod ?? null,
      confidence: input.confidence ?? null,
      version: 1,
      sort_order: 0,
      created_by: input.email,
      updated_by: input.email,
      created_at: timestamp,
      updated_at: timestamp,
    });
    await d
      .prepare(
        `UPDATE idempotency_keys SET result_json=? WHERE wiki_id=? AND actor_email=? AND operation_name=? AND operation_id=?`,
      )
      .bind(
        JSON.stringify(result),
        input.wikiId,
        input.email,
        operationName,
        input.operationId,
      )
      .run();
    return result;
  } catch (error) {
    await compensateSnapshot(input.wikiId, snap, "page_create_failed");
    const appError =
      error instanceof AppError
        ? error
        : new AppError(
            "validation_error",
            "A sibling page already uses this title or path.",
            409,
            { slug },
          );
    await failIdempotency({ ...input, operationName, error: appError });
    throw appError;
  }
}

export async function updatePage(input: {
  wikiId: string;
  email: string;
  pageId: string;
  expectedVersion: number;
  markdown: string;
  changeSummary: string;
  operationId: string;
  requestId: string;
  origin: "human" | "webmcp";
  saveKind?: "explicit" | "autosave" | "webmcp" | "restore";
  sourceRevisionVersion?: number;
}): Promise<{ page_id: string; version: number; change_set: ChangeSet }> {
  const saveKind =
      input.saveKind ?? (input.origin === "webmcp" ? "webmcp" : "explicit"),
    operationName =
      saveKind === "restore" ? "wiki_restore_revision" : "wiki_update_page",
    payload = {
      page_id: input.pageId,
      expected_version: input.expectedVersion,
      markdown: input.markdown,
      change_summary: input.changeSummary,
      source_revision_version: input.sourceRevisionVersion,
    },
    reservation = await reserveIdempotency({
      ...input,
      operationName,
      payload,
    });
  if (reservation.cached)
    return reservation.cached as unknown as {
      page_id: string;
      version: number;
      change_set: ChangeSet;
    };
  const current = await getPage(input.wikiId, input.pageId);
  const nextVersion = input.expectedVersion + 1,
    timestamp = now();
  if (current.version !== input.expectedVersion) {
    const error = new AppError(
      "version_conflict",
      "The page changed after it was read.",
      409,
      {
        page_id: input.pageId,
        expected_version: input.expectedVersion,
        current_version: current.version,
        next_action:
          "Read the current page and retry with an intentional merge.",
      },
    );
    await failIdempotency({ ...input, operationName, error });
    throw error;
  }
  await assertContentQuota(
    input.wikiId,
    bytes(input.markdown) - bytes(current.markdown),
    bytes(input.markdown),
  );
  const frontmatter = JSON.stringify(parseFrontmatter(input.markdown)),
    snap = await snapshot(
      input.wikiId,
      input.pageId,
      nextVersion,
      input.markdown,
      input.operationId,
    ),
    links = extractWikiLinks(input.markdown),
    d = db();
  const changeSet: ChangeSet = {
    pages_changed: [input.pageId],
    tree_changed: false,
    links_changed: true,
    search_changed: true,
    graph_changed: true,
    knowledge_changed: false,
  };
  const result = {
    page_id: input.pageId,
    version: nextVersion,
    change_set: changeSet,
  };
  try {
    const statements = [
      d
        .prepare(
          `UPDATE pages SET markdown=?,frontmatter_json=?,version=version+1,updated_by=?,updated_at=?,last_operation_id=? WHERE id=? AND wiki_id=? AND version=? AND deleted_at IS NULL`,
        )
        .bind(
          input.markdown,
          frontmatter,
          input.email,
          timestamp,
          input.operationId,
          input.pageId,
          input.wikiId,
          input.expectedVersion,
        ),
      d
        .prepare(
          `INSERT INTO page_revisions(id,page_id,version,snapshot_inline,snapshot_object_key,content_sha256,frontmatter_json,change_summary,actor_email,origin,save_kind,operation_id,status,created_at) SELECT ?,p.id,p.version,?,?,?,?,?,?,?,?,?,'ready',? FROM pages p WHERE p.id=? AND p.wiki_id=? AND p.last_operation_id=?`,
        )
        .bind(
          uuid(),
          snap.inline,
          snap.key,
          snap.hash,
          frontmatter,
          input.changeSummary,
          input.email,
          input.origin,
          saveKind,
          input.operationId,
          timestamp,
          input.pageId,
          input.wikiId,
          input.operationId,
        ),
      d
        .prepare(
          `DELETE FROM page_links WHERE wiki_id=? AND source_page_id=? AND EXISTS(SELECT 1 FROM pages WHERE id=? AND wiki_id=? AND last_operation_id=?)`,
        )
        .bind(
          input.wikiId,
          input.pageId,
          input.pageId,
          input.wikiId,
          input.operationId,
        ),
      ...links.map((target) =>
        d
          .prepare(
            `INSERT INTO page_links(id,wiki_id,source_page_id,target_page_id,target_text,link_kind,created_at) SELECT ?,?,?,(SELECT CASE WHEN COUNT(*)=1 THEN MIN(id) ELSE NULL END FROM pages WHERE wiki_id=? AND title=? AND deleted_at IS NULL),?,'wikilink',? FROM pages p WHERE p.id=? AND p.wiki_id=? AND p.last_operation_id=?`,
          )
          .bind(
            uuid(),
            input.wikiId,
            input.pageId,
            input.wikiId,
            target,
            target,
            timestamp,
            input.pageId,
            input.wikiId,
            input.operationId,
          ),
      ),
      d
        .prepare(
          `UPDATE wiki_usage SET page_bytes=page_bytes+?,revision_inline_bytes=revision_inline_bytes+?,r2_ready_revision_bytes=r2_ready_revision_bytes+?,revision_count=revision_count+1,updated_at=? WHERE wiki_id=? AND EXISTS(SELECT 1 FROM pages WHERE id=? AND last_operation_id=?)`,
        )
        .bind(
          bytes(input.markdown) - bytes(current.markdown),
          snap.inline ? bytes(input.markdown) : 0,
          snap.key ? bytes(input.markdown) : 0,
          timestamp,
          input.wikiId,
          input.pageId,
          input.operationId,
        ),
      d
        .prepare(
          `INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) SELECT ?,?,?,?,?,'page',?,'success',?,?,? FROM pages p WHERE p.id=? AND p.last_operation_id=?`,
        )
        .bind(
          uuid(),
          input.wikiId,
          input.email,
          input.origin,
          saveKind === "restore" ? "page.restore" : "page.update",
          input.pageId,
          input.requestId,
          JSON.stringify({
            from_version: input.expectedVersion,
            to_version: nextVersion,
            source_revision_version: input.sourceRevisionVersion,
          }),
          timestamp,
          input.pageId,
          input.operationId,
        ),
      d
        .prepare(
          `UPDATE idempotency_keys SET status='completed',result_json=?,completed_at=? WHERE wiki_id=? AND actor_email=? AND operation_name=? AND operation_id=? AND EXISTS(SELECT 1 FROM pages WHERE id=? AND last_operation_id=?)`,
        )
        .bind(
          JSON.stringify(result),
          timestamp,
          input.wikiId,
          input.email,
          operationName,
          input.operationId,
          input.pageId,
          input.operationId,
        ),
    ];
    const batch = await d.batch(statements);
    if ((batch[0].meta.changes ?? 0) !== 1) {
      await compensateSnapshot(input.wikiId, snap, "page_update_cas_failed");
      const latest = await getPage(input.wikiId, input.pageId);
      const error = new AppError(
        "version_conflict",
        "The page changed after it was read.",
        409,
        {
          page_id: input.pageId,
          expected_version: input.expectedVersion,
          current_version: latest.version,
          next_action:
            "Read the current page and retry with an intentional merge.",
        },
      );
      await failIdempotency({ ...input, operationName, error });
      throw error;
    }
    return result;
  } catch (error) {
    if (error instanceof AppError) throw error;
    await compensateSnapshot(input.wikiId, snap, "page_update_failed");
    const appError = new AppError(
      "internal_error",
      "The page update could not be completed.",
      500,
      {},
      true,
    );
    await failIdempotency({ ...input, operationName, error: appError });
    throw appError;
  }
}

export async function appendPage(input: {
  wikiId: string;
  email: string;
  pageId: string;
  expectedVersion: number;
  content: string;
  section: string | null;
  operationId: string;
  requestId: string;
  origin: "human" | "webmcp";
  replaceEmptyState?: boolean;
}) {
  const page = await getPage(input.wikiId, input.pageId);
  const markdown = appendMarkdownToSection(
    page.markdown,
    input.content,
    input.section,
    input.replaceEmptyState ?? false,
  );
  return updatePage({
    wikiId: input.wikiId,
    email: input.email,
    pageId: input.pageId,
    expectedVersion: input.expectedVersion,
    markdown,
    changeSummary: `Appended${input.section ? ` to ${input.section}` : ""}`,
    operationId: input.operationId,
    requestId: input.requestId,
    origin: input.origin,
  });
}

export async function searchPages(
  wikiId: string,
  query: string,
  pageTypes: PageType[],
  limit: number,
  offset = 0,
) {
  const typePlaceholders = pageTypes.length
    ? pageTypes.map(() => "?").join(",")
    : "";
  const sql = `SELECT ${PAGE_COLUMNS} FROM pages WHERE wiki_id=? AND deleted_at IS NULL AND (instr(lower(title),lower(?))>0 OR instr(lower(markdown),lower(?))>0) ${pageTypes.length ? `AND page_type IN (${typePlaceholders})` : ""} ORDER BY CASE WHEN lower(title)=lower(?) THEN 0 WHEN instr(lower(title),lower(?))=1 THEN 1 ELSE 2 END,updated_at DESC,id ASC LIMIT ? OFFSET ?`;
  const args = [
    wikiId,
    query,
    query,
    ...pageTypes,
    query,
    query,
    limit,
    offset,
  ];
  const rows = await db()
    .prepare(sql)
    .bind(...args)
    .all<PageRow>();
  return Promise.all(
    rows.results.map(async (row) => ({
      page_id: row.id,
      title: row.title,
      path: await pagePath(row),
      page_type: row.page_type,
      snippet: row.markdown.slice(0, 240),
      version: row.version,
      updated_at: row.updated_at,
    })),
  );
}
export async function countSearchPages(
  wikiId: string,
  query: string,
  pageTypes: PageType[],
) {
  const typePlaceholders = pageTypes.length
    ? pageTypes.map(() => "?").join(",")
    : "";
  const row = await db()
    .prepare(
      `SELECT COUNT(*) AS total FROM pages WHERE wiki_id=? AND deleted_at IS NULL AND (instr(lower(title),lower(?))>0 OR instr(lower(markdown),lower(?))>0) ${pageTypes.length ? `AND page_type IN (${typePlaceholders})` : ""}`,
    )
    .bind(wikiId, query, query, ...pageTypes)
    .first<{ total: number }>();
  return Number(row?.total ?? 0);
}

async function benchmarkSamples(
  operation: () => Promise<unknown>,
  targetP95Ms?: number,
) {
  await operation();
  const samples: number[] = [];
  for (let index = 0; index < 20; index++) {
    const started = performance.now();
    await operation();
    samples.push(performance.now() - started);
  }
  const sorted = [...samples].sort((a, b) => a - b),
    p95 = sorted[Math.ceil(sorted.length * 0.95) - 1],
    result: Record<string, unknown> = {
      samples_ms: samples.map((sample) => Number(sample.toFixed(2))),
      p50_ms: Number(sorted[Math.floor(sorted.length * 0.5)].toFixed(2)),
      p95_ms: Number(p95.toFixed(2)),
    };
  if (targetP95Ms !== undefined) {
    result.target_p95_ms = targetP95Ms;
    result.target_met = p95 <= targetP95Ms;
  }
  return result;
}

function searchBenchmarkMarker(runId: string) {
  return `sb-${runId.slice(0, 16)}`;
}

export async function seedSearchBenchmark(
  wikiId: string,
  runId: string,
  offset: number,
  count: number,
) {
  const d = db(),
    marker = searchBenchmarkMarker(runId),
    timestamp = now(),
    insertBatchSize = 100;
  for (
    let batchOffset = 0;
    batchOffset < count;
    batchOffset += insertBatchSize
  ) {
    const statements = Array.from(
      { length: Math.min(insertBatchSize, count - batchOffset) },
      (_, index) => {
        const sequence = offset + batchOffset + index;
        return d
          .prepare(
            `INSERT INTO pages(id,wiki_id,parent_id,parent_key,slug,title,page_type,markdown,frontmatter_json,version,sort_order,created_by,updated_by,last_operation_id,created_at,updated_at) VALUES(?,?,NULL,?,?,?,?,?,'{}',1,?,?,?,?,?,?)`,
          )
          .bind(
            uuid(),
            wikiId,
            ROOT_PARENT,
            `benchmark-${runId.slice(0, 8)}-${sequence}`,
            `Benchmark page ${sequence}`,
            "note",
            `# Benchmark page ${sequence}\n\n${marker}`,
            sequence,
            "system@benchmark.local",
            "system@benchmark.local",
            runId,
            timestamp,
            timestamp,
          );
      },
    );
    await d.batch(statements);
  }
  return { seeded_count: count, next_offset: offset + count };
}

export async function measureSearchBenchmark(
  wikiId: string,
  runId: string,
  pageCount: number,
) {
  const d = db(),
    marker = searchBenchmarkMarker(runId),
    pageTypes: PageType[] = [
      "folder",
      "note",
      "source",
      "concept",
      "entity",
      "synthesis",
      "comparison",
      "query",
    ],
    fixture = await d
      .prepare(
        `SELECT COUNT(*) AS count,MIN(id) AS sample_page_id FROM pages WHERE wiki_id=? AND last_operation_id=?`,
      )
      .bind(wikiId, runId)
      .first<{ count: number; sample_page_id: string | null }>();
  if (Number(fixture?.count ?? 0) !== pageCount || !fixture?.sample_page_id)
    throw new AppError(
      "validation_error",
      "The search benchmark fixture is incomplete.",
      409,
      {
        expected_page_count: pageCount,
        actual_page_count: fixture?.count ?? 0,
      },
    );
  const search = await benchmarkSamples(
      () => searchPages(wikiId, marker, pageTypes, 20),
      500,
    ),
    pageRead = await benchmarkSamples(
      () => getPage(wikiId, fixture.sample_page_id!),
      300,
    ),
    treeNodes = await listPages(wikiId, null, 200, 64),
    tree = await benchmarkSamples(() => listPages(wikiId, null, 200, 64));
  return {
    page_count: pageCount,
    ...search,
    search,
    page_read: pageRead,
    tree_first_page: {
      ...tree,
      requested_node_limit: 200,
      returned_node_count: treeNodes.length,
      maximum_first_screen_nodes: 500,
      node_cap_met: treeNodes.length <= 500,
    },
  };
}

export async function cleanupSearchBenchmark(wikiId: string, runId: string) {
  const d = db();
  await d
    .prepare(`DELETE FROM pages WHERE wiki_id=? AND last_operation_id=?`)
    .bind(wikiId, runId)
    .run();
  const remaining = await d
    .prepare(
      `SELECT COUNT(*) AS count FROM pages WHERE wiki_id=? AND last_operation_id=?`,
    )
    .bind(wikiId, runId)
    .first<{ count: number }>();
  return { cleanup_verified: Number(remaining?.count ?? 0) === 0 };
}
export async function listRevisions(
  wikiId: string,
  pageId: string,
  limit: number,
) {
  await getPage(wikiId, pageId);
  const rows = await db()
    .prepare(
      `SELECT version,change_summary,actor_email,origin,save_kind,status,is_pinned,created_at FROM page_revisions WHERE page_id=? ORDER BY version DESC LIMIT ?`,
    )
    .bind(pageId, limit)
    .all();
  return rows.results;
}
export async function getNeighbors(
  wikiId: string,
  pageId: string,
  limit: number,
  depth = 1,
) {
  await getPage(wikiId, pageId);
  if (depth === 0) return [];
  const found: Record<string, unknown>[] = [],
    edgeKeys = new Set<string>(),
    visited = new Set<string>([pageId]);
  let frontier = [pageId];
  for (let level = 0; level < depth && frontier.length; level++) {
    const placeholders = frontier.map(() => "?").join(","),
      remaining = limit - found.length;
    if (remaining <= 0) break;
    const rows = await db()
      .prepare(
        `SELECT l.source_page_id,l.target_page_id,l.target_text,s.title AS source_title,s.version AS source_version,t.title AS target_title,t.version AS target_version FROM page_links l LEFT JOIN pages s ON s.id=l.source_page_id AND s.wiki_id=l.wiki_id AND s.deleted_at IS NULL LEFT JOIN pages t ON t.id=l.target_page_id AND t.wiki_id=l.wiki_id AND t.deleted_at IS NULL WHERE l.wiki_id=? AND (l.source_page_id IN (${placeholders}) OR l.target_page_id IN (${placeholders})) LIMIT ?`,
      )
      .bind(wikiId, ...frontier, ...frontier, remaining)
      .all<Record<string, unknown>>();
    const next: string[] = [];
    for (const row of rows.results) {
      const source = String(row.source_page_id),
        target =
          typeof row.target_page_id === "string" ? row.target_page_id : null,
        edgeKey = `${source}:${target ?? "unresolved"}:${String(row.target_text)}`;
      if (!edgeKeys.has(edgeKey)) {
        edgeKeys.add(edgeKey);
        found.push({ ...row, distance: level + 1 });
      }
      for (const candidate of target ? [source, target] : [source])
        if (!visited.has(candidate)) {
          visited.add(candidate);
          next.push(candidate);
        }
    }
    frontier = next;
  }
  return found.slice(0, limit);
}

function versionConflict(
  pageId: string,
  expectedVersion: number,
  currentVersion: number,
) {
  return new AppError(
    "version_conflict",
    "The page changed after it was read.",
    409,
    {
      page_id: pageId,
      expected_version: expectedVersion,
      current_version: currentVersion,
      next_action: "Read the current page and retry with an intentional merge.",
    },
  );
}

async function assertValidParent(
  wikiId: string,
  pageId: string,
  newParentId: string | null,
) {
  if (!newParentId) return;
  if (newParentId === pageId)
    throw new AppError(
      "validation_error",
      "A page cannot be moved under itself.",
      400,
      { page_id: pageId },
    );
  let cursor: string | null = newParentId;
  for (let depth = 0; cursor && depth < 65; depth++) {
    if (cursor === pageId)
      throw new AppError(
        "validation_error",
        "A page cannot be moved under one of its descendants.",
        400,
        { page_id: pageId, parent_id: newParentId },
      );
    const parent: { parent_id: string | null; page_type: string } | null =
      await db()
        .prepare(
          `SELECT parent_id,page_type FROM pages WHERE id=? AND wiki_id=? AND deleted_at IS NULL`,
        )
        .bind(cursor, wikiId)
        .first<{ parent_id: string | null; page_type: string }>();
    if (!parent)
      throw new AppError(
        "not_found",
        "The requested parent page was not found.",
        404,
        { parent_id: newParentId },
      );
    if (depth === 0 && parent.page_type !== "folder")
      throw new AppError(
        "validation_error",
        "Pages and folders can only be moved under a folder node.",
        400,
        { parent_id: newParentId },
      );
    cursor = parent.parent_id;
    if (depth === 64 && cursor)
      throw new AppError(
        "validation_error",
        "The page tree exceeds the supported depth.",
        400,
        { max_depth: 64 },
      );
  }
}

export async function movePage(input: {
  wikiId: string;
  email: string;
  pageId: string;
  expectedVersion: number;
  parentId: string | null;
  sortOrder: number;
  operationId: string;
  requestId: string;
  origin: "human" | "webmcp";
}) {
  const operationName = "wiki_move_page",
    payload = {
      page_id: input.pageId,
      expected_version: input.expectedVersion,
      parent_id: input.parentId,
      sort_order: input.sortOrder,
    },
    reservation = await reserveIdempotency({
      ...input,
      operationName,
      payload,
    });
  if (reservation.cached)
    return reservation.cached as unknown as {
      page_id: string;
      version: number;
      path: string;
      change_set: ChangeSet;
    };
  const current = await getPage(input.wikiId, input.pageId);
  if (current.version !== input.expectedVersion) {
    const error = versionConflict(
      input.pageId,
      input.expectedVersion,
      current.version,
    );
    await failIdempotency({ ...input, operationName, error });
    throw error;
  }
  await assertValidParent(input.wikiId, input.pageId, input.parentId);
  const timestamp = now(),
    nextVersion = input.expectedVersion + 1,
    d = db(),
    snap = await snapshot(
      input.wikiId,
      input.pageId,
      nextVersion,
      current.markdown,
      input.operationId,
    );
  const changeSet: ChangeSet = {
    pages_changed: [input.pageId],
    tree_changed: true,
    links_changed: false,
    search_changed: true,
    graph_changed: true,
    knowledge_changed: false,
  };
  const result: {
    page_id: string;
    version: number;
    path: string;
    change_set: ChangeSet;
  } = {
    page_id: input.pageId,
    version: nextVersion,
    path: "",
    change_set: changeSet,
  };
  let committed = false;
  try {
    const batch = await d.batch([
      d
        .prepare(
          `UPDATE pages SET parent_id=?,parent_key=?,sort_order=?,version=version+1,updated_by=?,updated_at=?,last_operation_id=? WHERE id=? AND wiki_id=? AND version=? AND deleted_at IS NULL`,
        )
        .bind(
          input.parentId,
          input.parentId ?? ROOT_PARENT,
          input.sortOrder,
          input.email,
          timestamp,
          input.operationId,
          input.pageId,
          input.wikiId,
          input.expectedVersion,
        ),
      d
        .prepare(
          `INSERT INTO page_revisions(id,page_id,version,snapshot_inline,snapshot_object_key,content_sha256,change_summary,actor_email,origin,save_kind,operation_id,status,created_at) SELECT ?,p.id,p.version,?,?,?,?,?,?,?,?,'ready',? FROM pages p WHERE p.id=? AND p.wiki_id=? AND p.last_operation_id=?`,
        )
        .bind(
          uuid(),
          snap.inline,
          snap.key,
          snap.hash,
          "Page moved",
          input.email,
          input.origin,
          input.origin === "webmcp" ? "webmcp" : "explicit",
          input.operationId,
          timestamp,
          input.pageId,
          input.wikiId,
          input.operationId,
        ),
      d
        .prepare(
          `UPDATE wiki_usage SET revision_inline_bytes=revision_inline_bytes+?,r2_ready_revision_bytes=r2_ready_revision_bytes+?,revision_count=revision_count+1,updated_at=? WHERE wiki_id=? AND EXISTS(SELECT 1 FROM pages WHERE id=? AND last_operation_id=?)`,
        )
        .bind(
          snap.inline ? bytes(current.markdown) : 0,
          snap.key ? bytes(current.markdown) : 0,
          timestamp,
          input.wikiId,
          input.pageId,
          input.operationId,
        ),
      d
        .prepare(
          `INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) SELECT ?,?,?,?,'page.move','page',?,'success',?,?,? FROM pages p WHERE p.id=? AND p.last_operation_id=?`,
        )
        .bind(
          uuid(),
          input.wikiId,
          input.email,
          input.origin,
          input.pageId,
          input.requestId,
          JSON.stringify({
            from_parent_id: current.parent_id,
            to_parent_id: input.parentId,
            sort_order: input.sortOrder,
          }),
          timestamp,
          input.pageId,
          input.operationId,
        ),
      d
        .prepare(
          `UPDATE idempotency_keys SET status='completed',result_json=?,completed_at=? WHERE wiki_id=? AND actor_email=? AND operation_name=? AND operation_id=? AND EXISTS(SELECT 1 FROM pages WHERE id=? AND last_operation_id=?)`,
        )
        .bind(
          JSON.stringify(result),
          timestamp,
          input.wikiId,
          input.email,
          operationName,
          input.operationId,
          input.pageId,
          input.operationId,
        ),
    ]);
    if ((batch[0].meta.changes ?? 0) !== 1) {
      const latest = await getPage(input.wikiId, input.pageId);
      throw versionConflict(
        input.pageId,
        input.expectedVersion,
        latest.version,
      );
    }
    committed = true;
    result.path = (await getPage(input.wikiId, input.pageId)).path;
    await d
      .prepare(
        `UPDATE idempotency_keys SET result_json=? WHERE wiki_id=? AND actor_email=? AND operation_name=? AND operation_id=?`,
      )
      .bind(
        JSON.stringify(result),
        input.wikiId,
        input.email,
        operationName,
        input.operationId,
      )
      .run();
    return result;
  } catch (error) {
    if (!committed)
      await compensateSnapshot(input.wikiId, snap, "page_move_failed");
    const appError =
      error instanceof AppError
        ? error
        : new AppError(
            "validation_error",
            "The destination already contains a page with this slug.",
            409,
            { slug: current.slug },
          );
    if (!committed)
      await failIdempotency({ ...input, operationName, error: appError });
    throw appError;
  }
}

export async function softDeletePage(input: {
  wikiId: string;
  email: string;
  pageId: string;
  expectedVersion: number;
  confirmation: string;
  reason: string;
  operationId: string;
  requestId: string;
  origin: "human" | "webmcp";
}) {
  const operationName = "wiki_delete_page",
    payload = {
      page_id: input.pageId,
      expected_version: input.expectedVersion,
      confirmation: input.confirmation,
      reason: input.reason,
    },
    reservation = await reserveIdempotency({
      ...input,
      operationName,
      payload,
    });
  if (reservation.cached)
    return reservation.cached as unknown as {
      page_id: string;
      version: number;
      deleted_at: string;
      change_set: ChangeSet;
    };
  const current = await getPage(input.wikiId, input.pageId);
  if (current.version !== input.expectedVersion) {
    const error = versionConflict(
      input.pageId,
      input.expectedVersion,
      current.version,
    );
    await failIdempotency({ ...input, operationName, error });
    throw error;
  }
  if (input.confirmation !== `DELETE ${current.title}`) {
    const error = new AppError(
      "validation_error",
      `Type DELETE ${current.title} to confirm this soft delete.`,
      400,
      { confirmation_expected: `DELETE ${current.title}` },
    );
    await failIdempotency({ ...input, operationName, error });
    throw error;
  }
  const child = await db()
    .prepare(
      `SELECT id FROM pages WHERE wiki_id=? AND parent_id=? AND deleted_at IS NULL LIMIT 1`,
    )
    .bind(input.wikiId, input.pageId)
    .first<{ id: string }>();
  if (child) {
    const error = new AppError(
      "validation_error",
      "Only leaf pages can be deleted. Move or delete child pages first.",
      409,
      { child_page_id: child.id },
    );
    await failIdempotency({ ...input, operationName, error });
    throw error;
  }
  const timestamp = now(),
    nextVersion = input.expectedVersion + 1,
    d = db(),
    snap = await snapshot(
      input.wikiId,
      input.pageId,
      nextVersion,
      current.markdown,
      input.operationId,
    ),
    changeSet: ChangeSet = {
      pages_changed: [input.pageId],
      tree_changed: true,
      links_changed: true,
      search_changed: true,
      graph_changed: true,
      knowledge_changed: false,
    },
    result: {
      page_id: string;
      version: number;
      deleted_at: string;
      change_set: ChangeSet;
    } = {
      page_id: input.pageId,
      version: nextVersion,
      deleted_at: timestamp,
      change_set: changeSet,
    };
  try {
    const batch = await d.batch([
      d
        .prepare(
          `UPDATE pages SET parent_key=?,version=version+1,updated_by=?,updated_at=?,deleted_at=?,last_operation_id=? WHERE id=? AND wiki_id=? AND version=? AND deleted_at IS NULL`,
        )
        .bind(
          `__deleted__:${input.pageId}`,
          input.email,
          timestamp,
          timestamp,
          input.operationId,
          input.pageId,
          input.wikiId,
          input.expectedVersion,
        ),
      d
        .prepare(
          `INSERT INTO page_revisions(id,page_id,version,snapshot_inline,snapshot_object_key,content_sha256,change_summary,actor_email,origin,save_kind,operation_id,status,created_at) SELECT ?,p.id,p.version,?,?,?,?,?,?,?,?,'ready',? FROM pages p WHERE p.id=? AND p.last_operation_id=?`,
        )
        .bind(
          uuid(),
          snap.inline,
          snap.key,
          snap.hash,
          `Soft deleted: ${input.reason}`,
          input.email,
          input.origin,
          input.origin === "webmcp" ? "webmcp" : "explicit",
          input.operationId,
          timestamp,
          input.pageId,
          input.operationId,
        ),
      d
        .prepare(
          `DELETE FROM page_links WHERE wiki_id=? AND source_page_id=? AND EXISTS(SELECT 1 FROM pages WHERE id=? AND last_operation_id=?)`,
        )
        .bind(input.wikiId, input.pageId, input.pageId, input.operationId),
      d
        .prepare(
          `UPDATE wiki_usage SET page_bytes=MAX(page_bytes-?,0),revision_inline_bytes=revision_inline_bytes+?,r2_ready_revision_bytes=r2_ready_revision_bytes+?,page_count=MAX(page_count-1,0),revision_count=revision_count+1,updated_at=? WHERE wiki_id=? AND EXISTS(SELECT 1 FROM pages WHERE id=? AND last_operation_id=?)`,
        )
        .bind(
          bytes(current.markdown),
          snap.inline ? bytes(current.markdown) : 0,
          snap.key ? bytes(current.markdown) : 0,
          timestamp,
          input.wikiId,
          input.pageId,
          input.operationId,
        ),
      d
        .prepare(
          `INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) SELECT ?,?,?,?,'page.soft_delete','page',?,'success',?,?,? FROM pages p WHERE p.id=? AND p.last_operation_id=?`,
        )
        .bind(
          uuid(),
          input.wikiId,
          input.email,
          input.origin,
          input.pageId,
          input.requestId,
          JSON.stringify({ reason: input.reason }),
          timestamp,
          input.pageId,
          input.operationId,
        ),
      d
        .prepare(
          `UPDATE idempotency_keys SET status='completed',result_json=?,completed_at=? WHERE wiki_id=? AND actor_email=? AND operation_name=? AND operation_id=? AND EXISTS(SELECT 1 FROM pages WHERE id=? AND last_operation_id=?)`,
        )
        .bind(
          JSON.stringify(result),
          timestamp,
          input.wikiId,
          input.email,
          operationName,
          input.operationId,
          input.pageId,
          input.operationId,
        ),
    ]);
    if ((batch[0].meta.changes ?? 0) !== 1) {
      await compensateSnapshot(input.wikiId, snap, "page_delete_cas_failed");
      const latest = await getPageIncludingDeleted(input.wikiId, input.pageId);
      const error = versionConflict(
        input.pageId,
        input.expectedVersion,
        latest.version,
      );
      await failIdempotency({ ...input, operationName, error });
      throw error;
    }
    return result;
  } catch (error) {
    if (error instanceof AppError) throw error;
    await compensateSnapshot(input.wikiId, snap, "page_delete_failed");
    const appError = new AppError(
      "internal_error",
      "The page could not be soft deleted.",
      500,
      {},
      true,
    );
    await failIdempotency({ ...input, operationName, error: appError });
    throw appError;
  }
}

export async function restoreDeletedPage(input: {
  wikiId: string;
  email: string;
  pageId: string;
  expectedVersion: number;
  replacementSlug: string | null;
  operationId: string;
  requestId: string;
  origin: "human" | "webmcp";
}) {
  const operationName = "wiki_restore_deleted_page",
    payload = {
      page_id: input.pageId,
      expected_version: input.expectedVersion,
      replacement_slug: input.replacementSlug,
    },
    reservation = await reserveIdempotency({
      ...input,
      operationName,
      payload,
    });
  if (reservation.cached)
    return reservation.cached as unknown as {
      page_id: string;
      version: number;
      path: string;
      change_set: ChangeSet;
    };
  const current = await getPageIncludingDeleted(input.wikiId, input.pageId);
  if (!current.deleted_at) {
    const error = new AppError(
      "validation_error",
      "The page is not deleted.",
      409,
      { page_id: input.pageId },
    );
    await failIdempotency({ ...input, operationName, error });
    throw error;
  }
  if (current.version !== input.expectedVersion) {
    const error = versionConflict(
      input.pageId,
      input.expectedVersion,
      current.version,
    );
    await failIdempotency({ ...input, operationName, error });
    throw error;
  }
  if (current.parent_id) await getPage(input.wikiId, current.parent_id);
  const restoredSlug = input.replacementSlug
      ? slugify(input.replacementSlug)
      : current.slug,
    parentKey = current.parent_id ?? ROOT_PARENT;
  const conflict = await db()
    .prepare(
      `SELECT id FROM pages WHERE wiki_id=? AND parent_key=? AND slug=? AND deleted_at IS NULL LIMIT 1`,
    )
    .bind(input.wikiId, parentKey, restoredSlug)
    .first<{ id: string }>();
  if (conflict) {
    const error = new AppError(
      "validation_error",
      "An active sibling already uses this slug. Provide replacement_slug.",
      409,
      { slug: restoredSlug, conflicting_page_id: conflict.id },
    );
    await failIdempotency({ ...input, operationName, error });
    throw error;
  }
  const timestamp = now(),
    nextVersion = input.expectedVersion + 1,
    d = db(),
    snap = await snapshot(
      input.wikiId,
      input.pageId,
      nextVersion,
      current.markdown,
      input.operationId,
    ),
    links = extractWikiLinks(current.markdown),
    changeSet: ChangeSet = {
      pages_changed: [input.pageId],
      tree_changed: true,
      links_changed: true,
      search_changed: true,
      graph_changed: true,
      knowledge_changed: false,
    },
    result = {
      page_id: input.pageId,
      version: nextVersion,
      path: "",
      change_set: changeSet,
    };
  let committed = false;
  try {
    const batch = await d.batch([
      d
        .prepare(
          `UPDATE pages SET parent_key=?,slug=?,version=version+1,updated_by=?,updated_at=?,deleted_at=NULL,last_operation_id=? WHERE id=? AND wiki_id=? AND version=? AND deleted_at IS NOT NULL`,
        )
        .bind(
          parentKey,
          restoredSlug,
          input.email,
          timestamp,
          input.operationId,
          input.pageId,
          input.wikiId,
          input.expectedVersion,
        ),
      d
        .prepare(
          `INSERT INTO page_revisions(id,page_id,version,snapshot_inline,snapshot_object_key,content_sha256,change_summary,actor_email,origin,save_kind,operation_id,status,created_at) SELECT ?,p.id,p.version,?,?,?,?,?,?,'restore',?,'ready',? FROM pages p WHERE p.id=? AND p.last_operation_id=?`,
        )
        .bind(
          uuid(),
          snap.inline,
          snap.key,
          snap.hash,
          "Deleted page restored",
          input.email,
          input.origin,
          input.operationId,
          timestamp,
          input.pageId,
          input.operationId,
        ),
      ...links.map((target) =>
        d
          .prepare(
            `INSERT INTO page_links(id,wiki_id,source_page_id,target_page_id,target_text,link_kind,created_at) SELECT ?,?,?,(SELECT CASE WHEN COUNT(*)=1 THEN MIN(id) ELSE NULL END FROM pages WHERE wiki_id=? AND title=? AND deleted_at IS NULL),?,'wikilink',? FROM pages p WHERE p.id=? AND p.last_operation_id=?`,
          )
          .bind(
            uuid(),
            input.wikiId,
            input.pageId,
            input.wikiId,
            target,
            target,
            timestamp,
            input.pageId,
            input.operationId,
          ),
      ),
      d
        .prepare(
          `UPDATE wiki_usage SET page_bytes=page_bytes+?,revision_inline_bytes=revision_inline_bytes+?,r2_ready_revision_bytes=r2_ready_revision_bytes+?,page_count=page_count+1,revision_count=revision_count+1,updated_at=? WHERE wiki_id=? AND EXISTS(SELECT 1 FROM pages WHERE id=? AND last_operation_id=?)`,
        )
        .bind(
          bytes(current.markdown),
          snap.inline ? bytes(current.markdown) : 0,
          snap.key ? bytes(current.markdown) : 0,
          timestamp,
          input.wikiId,
          input.pageId,
          input.operationId,
        ),
      d
        .prepare(
          `INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) SELECT ?,?,?,?,'page.restore_deleted','page',?,'success',?,?,? FROM pages p WHERE p.id=? AND p.last_operation_id=?`,
        )
        .bind(
          uuid(),
          input.wikiId,
          input.email,
          input.origin,
          input.pageId,
          input.requestId,
          JSON.stringify({ slug: restoredSlug }),
          timestamp,
          input.pageId,
          input.operationId,
        ),
      d
        .prepare(
          `UPDATE idempotency_keys SET status='completed',result_json=?,completed_at=? WHERE wiki_id=? AND actor_email=? AND operation_name=? AND operation_id=? AND EXISTS(SELECT 1 FROM pages WHERE id=? AND last_operation_id=?)`,
        )
        .bind(
          JSON.stringify(result),
          timestamp,
          input.wikiId,
          input.email,
          operationName,
          input.operationId,
          input.pageId,
          input.operationId,
        ),
    ]);
    if ((batch[0].meta.changes ?? 0) !== 1) {
      const latest = await getPageIncludingDeleted(input.wikiId, input.pageId);
      throw versionConflict(
        input.pageId,
        input.expectedVersion,
        latest.version,
      );
    }
    committed = true;
    result.path = (await getPage(input.wikiId, input.pageId)).path;
    await d
      .prepare(
        `UPDATE idempotency_keys SET result_json=? WHERE wiki_id=? AND actor_email=? AND operation_name=? AND operation_id=?`,
      )
      .bind(
        JSON.stringify(result),
        input.wikiId,
        input.email,
        operationName,
        input.operationId,
      )
      .run();
    return result;
  } catch (error) {
    if (!committed)
      await compensateSnapshot(input.wikiId, snap, "page_restore_failed");
    const appError =
      error instanceof AppError
        ? error
        : new AppError(
            "validation_error",
            "The page could not be restored at that path.",
            409,
            { slug: restoredSlug },
          );
    if (!committed)
      await failIdempotency({ ...input, operationName, error: appError });
    throw appError;
  }
}

export async function getRevisionSnapshot(
  wikiId: string,
  pageId: string,
  version: number,
) {
  await getPage(wikiId, pageId);
  const revision = await db()
    .prepare(
      `SELECT version,snapshot_inline,snapshot_object_key,content_sha256,change_summary,actor_email,origin,save_kind,status,created_at FROM page_revisions WHERE page_id=? AND version=?`,
    )
    .bind(pageId, version)
    .first<{
      version: number;
      snapshot_inline: string | null;
      snapshot_object_key: string | null;
      content_sha256: string;
      change_summary: string | null;
      actor_email: string;
      origin: string;
      save_kind: string;
      status: string;
      created_at: string;
    }>();
  if (!revision)
    throw new AppError(
      "not_found",
      "The requested revision was not found.",
      404,
      { page_id: pageId, version },
    );
  if (revision.status !== "ready")
    throw new AppError(
      "not_found",
      "This revision snapshot is not available.",
      410,
      { page_id: pageId, version, status: revision.status },
    );
  let markdown: string | null = revision.snapshot_inline;
  if (markdown === null && revision.snapshot_object_key) {
    const object = await env.FILES?.get(revision.snapshot_object_key);
    if (object) markdown = await object.text();
  }
  if (
    markdown === null ||
    (await sha256(markdown)) !== revision.content_sha256
  ) {
    await db()
      .prepare(
        `UPDATE page_revisions SET status='missing' WHERE page_id=? AND version=? AND status='ready'`,
      )
      .bind(pageId, version)
      .run();
    throw new AppError(
      "retryable_storage_error",
      "The revision snapshot is missing or failed checksum verification.",
      503,
      { page_id: pageId, version },
      false,
    );
  }
  return {
    version: revision.version,
    markdown,
    content_sha256: revision.content_sha256,
    change_summary: revision.change_summary,
    actor_email: revision.actor_email,
    origin: revision.origin,
    save_kind: revision.save_kind,
    created_at: revision.created_at,
  };
}

export async function restoreRevision(input: {
  wikiId: string;
  email: string;
  pageId: string;
  expectedVersion: number;
  restoreVersion: number;
  operationId: string;
  requestId: string;
  origin: "human" | "webmcp";
}) {
  const revision = await getRevisionSnapshot(
    input.wikiId,
    input.pageId,
    input.restoreVersion,
  );
  return updatePage({
    ...input,
    markdown: revision.markdown,
    changeSummary: `Restored revision v${input.restoreVersion}`,
    saveKind: "restore",
    sourceRevisionVersion: input.restoreVersion,
  });
}

export async function linkPages(input: {
  wikiId: string;
  email: string;
  sourcePageId: string;
  targetPageId: string;
  linkMode: LinkMode;
  section: string | null;
  expectedVersion: number;
  operationId: string;
  requestId: string;
  origin: "human" | "webmcp";
}) {
  if (input.linkMode === "append_section" && !input.section)
    throw new AppError(
      "validation_error",
      "section is required for append_section links.",
      400,
      { field: "section", link_mode: input.linkMode },
    );
  if (input.linkMode === "related_frontmatter" && input.section)
    throw new AppError(
      "validation_error",
      "section is only valid for append_section links.",
      400,
      { field: "section", link_mode: input.linkMode },
    );
  const [source, target] = await Promise.all([
    getPage(input.wikiId, input.sourcePageId),
    getPage(input.wikiId, input.targetPageId),
  ]);
  if (source.id === target.id)
    throw new AppError(
      "validation_error",
      "A page cannot link to itself through this operation.",
      400,
      { page_id: source.id },
    );
  const escaped = target.title.replace(/\]/g, "\\]"),
    wikiLink = `[[${escaped}]]`;
  if (extractWikiLinks(source.markdown).includes(target.title))
    throw new AppError(
      "validation_error",
      "The pages are already linked.",
      409,
      { source_page_id: source.id, target_page_id: target.id },
    );
  const markdown =
      input.linkMode === "related_frontmatter"
        ? addRelatedWikiLink(source.markdown, wikiLink)
        : appendMarkdownToSection(
            source.markdown,
            `- ${wikiLink}`,
            input.section,
          ),
    result = await updatePage({
      wikiId: input.wikiId,
      email: input.email,
      pageId: source.id,
      expectedVersion: input.expectedVersion,
      markdown,
      changeSummary: `Linked to ${target.title} via ${input.linkMode}`,
      operationId: input.operationId,
      requestId: input.requestId,
      origin: input.origin,
    });
  return {
    ...result,
    link: {
      source_page_id: source.id,
      target_page_id: target.id,
      link_mode: input.linkMode,
      section: input.section,
    },
  };
}

export async function getGraph(wikiId: string, limit: number) {
  const nodes = await db()
    .prepare(
      `SELECT id,title,page_type,version,updated_at FROM pages WHERE wiki_id=? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?`,
    )
    .bind(wikiId, limit)
    .all();
  const edges = await db()
    .prepare(
      `SELECT l.source_page_id AS source,l.target_page_id AS target,l.target_text,l.link_kind FROM page_links l JOIN pages s ON s.id=l.source_page_id AND s.deleted_at IS NULL JOIN pages t ON t.id=l.target_page_id AND t.deleted_at IS NULL WHERE l.wiki_id=? AND s.wiki_id=? AND t.wiki_id=? LIMIT ?`,
    )
    .bind(wikiId, wikiId, wikiId, limit * 8)
    .all();
  return {
    wiki_id: wikiId,
    nodes: nodes.results,
    edges: edges.results,
    truncated: nodes.results.length >= limit,
  };
}

async function assertAttachmentQuota(wikiId: string, incomingBytes: number) {
  const usage = await db()
    .prepare(
      `SELECT r2_ready_revision_bytes,r2_ready_attachment_bytes,r2_soft_deleted_bytes,r2_pending_bytes,r2_staging_import_bytes,r2_orphan_estimate_bytes,attachment_count FROM wiki_usage WHERE wiki_id=?`,
    )
    .bind(wikiId)
    .first<Record<string, number>>();
  const { attachment_count: attachmentCount = 0, ...storageUsage } =
    usage ?? {};
  assertActiveAttachmentCapacity(Number(attachmentCount));
  const used = Object.values(storageUsage).reduce(
    (sum, value) => sum + Number(value ?? 0),
    0,
  );
  if (used + incomingBytes > R2_SOFT_LIMIT_BYTES * 0.95)
    throw new AppError(
      "quota_exceeded",
      "The wiki storage safety limit would be exceeded.",
      413,
      {
        used_bytes: used,
        incoming_bytes: incomingBytes,
        soft_limit_bytes: R2_SOFT_LIMIT_BYTES,
      },
    );
}

type StoredOperatingContract = {
  wiki_id: string;
  version: number;
  contract_json: string;
  updated_by: string;
  updated_at: string;
  last_operation_id: string;
};

export async function getOperatingContract(wikiId: string) {
  const row = await db()
    .prepare(
      `SELECT wiki_id,version,contract_json,updated_by,updated_at,last_operation_id FROM wiki_operating_contracts WHERE wiki_id=?`,
    )
    .bind(wikiId)
    .first<StoredOperatingContract>();
  if (!row)
    return {
      wiki_id: wikiId,
      version: 0,
      contract: DEFAULT_OPERATING_CONTRACT,
      updated_by: null,
      updated_at: null,
      customized: false,
    };
  return {
    wiki_id: row.wiki_id,
    version: row.version,
    contract: parseOperatingContract(JSON.parse(row.contract_json)),
    updated_by: row.updated_by,
    updated_at: row.updated_at,
    customized: true,
  };
}

export async function updateOperatingContract(input: {
  wikiId: string;
  email: string;
  contract: WikiOperatingContract;
  expectedVersion: number;
  operationId: string;
  requestId: string;
  origin: "human" | "webmcp";
}) {
  const operationName = "wiki_update_operating_contract",
    contract = parseOperatingContract(input.contract),
    payload = {
      contract,
      expected_version: input.expectedVersion,
    },
    reservation = await reserveIdempotency({
      ...input,
      operationName,
      payload,
    });
  if (reservation.cached) return reservation.cached;
  const d = db(),
    timestamp = now(),
    contractJson = stableJson(contract),
    nextVersion = input.expectedVersion + 1,
    write =
      input.expectedVersion === 0
        ? d
            .prepare(
              `INSERT OR IGNORE INTO wiki_operating_contracts(wiki_id,version,contract_json,updated_by,updated_at,last_operation_id) VALUES(?,1,?,?,?,?)`,
            )
            .bind(
              input.wikiId,
              contractJson,
              input.email,
              timestamp,
              input.operationId,
            )
        : d
            .prepare(
              `UPDATE wiki_operating_contracts SET version=version+1,contract_json=?,updated_by=?,updated_at=?,last_operation_id=? WHERE wiki_id=? AND version=?`,
            )
            .bind(
              contractJson,
              input.email,
              timestamp,
              input.operationId,
              input.wikiId,
              input.expectedVersion,
            ),
    result = {
      wiki_id: input.wikiId,
      version: nextVersion,
      contract,
      updated_by: input.email,
      updated_at: timestamp,
      customized: true,
    };
  try {
    const batch = await d.batch([
      write,
      d
        .prepare(
          `INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) SELECT ?,?,?,?,'wiki.contract.update','wiki',?,'success',?,?,? FROM wiki_operating_contracts c WHERE c.wiki_id=? AND c.last_operation_id=?`,
        )
        .bind(
          uuid(),
          input.wikiId,
          input.email,
          input.origin,
          input.wikiId,
          input.requestId,
          JSON.stringify({
            from_version: input.expectedVersion,
            to_version: nextVersion,
          }),
          timestamp,
          input.wikiId,
          input.operationId,
        ),
      d
        .prepare(
          `UPDATE idempotency_keys SET status='completed',result_json=?,completed_at=? WHERE wiki_id=? AND actor_email=? AND operation_name=? AND operation_id=?`,
        )
        .bind(
          JSON.stringify(result),
          timestamp,
          input.wikiId,
          input.email,
          operationName,
          input.operationId,
        ),
    ]);
    if ((batch[0].meta.changes ?? 0) !== 1) {
      const current = await getOperatingContract(input.wikiId);
      const error = new AppError(
        "version_conflict",
        "The vault operating contract changed after it was read.",
        409,
        {
          expected_version: input.expectedVersion,
          current_version: current.version,
          next_action: "Read the current operating contract and retry.",
        },
      );
      await failIdempotency({ ...input, operationName, error });
      throw error;
    }
    return result;
  } catch (error) {
    if (error instanceof AppError) throw error;
    const appError = new AppError(
      "internal_error",
      "The vault operating contract could not be updated.",
      500,
      {},
      true,
    );
    await failIdempotency({ ...input, operationName, error: appError });
    throw appError;
  }
}

type PlannedPageAction = {
  action_id: string;
  operation_id: string;
  role: "source" | "knowledge";
  kind: "create" | "update" | "reuse";
  page: IngestSourceDraft | IngestPageDraft;
  target_page_id: string | null;
  expected_version: number | null;
};
type PlannedClaimAction = {
  action_id: string;
  claim_id: string;
  claim: IngestClaimDraft;
};
type StoredIngestPlan = {
  source_action: PlannedPageAction;
  page_actions: PlannedPageAction[];
  claim_actions: PlannedClaimAction[];
  knowledge_map_action: {
    action_id: string;
    patch: KnowledgeMapPatch;
  } | null;
  warnings: Array<{ code: string; message: string }>;
};
type IngestActionState = {
  completed: Record<
    string,
    {
      kind: "page" | "claim" | "knowledge_map";
      page_id?: string;
      claim_id?: string;
      version?: number;
    }
  >;
  page_ids_by_title: Record<string, string>;
};

async function validateIngestParent(wikiId: string, parentId: string | null) {
  if (!parentId) return;
  const parent = await getPage(wikiId, parentId);
  if (parent.page_type !== "folder")
    throw new AppError(
      "validation_error",
      "Ingest pages can only be placed under a folder node.",
      400,
      { parent_id: parentId },
    );
}

async function siblingCandidate(
  wikiId: string,
  parentId: string | null,
  title: string,
) {
  return db()
    .prepare(
      `SELECT id,title,page_type,version,source_url FROM pages WHERE wiki_id=? AND parent_key=? AND slug=? AND deleted_at IS NULL`,
    )
    .bind(wikiId, parentId ?? ROOT_PARENT, slugify(title))
    .first<{
      id: string;
      title: string;
      page_type: PageType;
      version: number;
      source_url: string | null;
    }>();
}

function titleKey(title: string) {
  return title.trim().toLocaleLowerCase();
}

export async function createIngestPlan(input: {
  wikiId: string;
  email: string;
  request: IngestRequest;
  requestId: string;
  origin: "human" | "webmcp";
}) {
  const contractEnvelope = await getOperatingContract(input.wikiId),
    contract = contractEnvelope.contract,
    proposed = input.request;
  await Promise.all([
    validateIngestParent(input.wikiId, proposed.source.parent_id),
    ...proposed.pages.map((page) =>
      validateIngestParent(input.wikiId, page.parent_id),
    ),
  ]);
  for (const page of proposed.pages)
    if (!contract.allowed_page_types.includes(page.page_type))
      throw new AppError(
        "validation_error",
        "A proposed page type is not allowed by the vault operating contract.",
        400,
        { title: page.title, page_type: page.page_type },
      );
  if (proposed.knowledge_map_patch)
    await validateKnowledgeMapPatch({
      wikiId: input.wikiId,
      patch: proposed.knowledge_map_patch,
      pendingPageTitles: new Set(
        [
          proposed.source.title,
          ...proposed.pages.map((page) => page.title),
        ].map(titleKey),
      ),
    });

  const sourceMatches = await db()
      .prepare(
        `SELECT id,title,page_type,version,source_url FROM pages WHERE wiki_id=? AND page_type='source' AND source_url=? AND deleted_at IS NULL ORDER BY created_at LIMIT 2`,
      )
      .bind(input.wikiId, proposed.source.source_url)
      .all<{
        id: string;
        title: string;
        page_type: PageType;
        version: number;
        source_url: string | null;
      }>(),
    sourceSibling = await siblingCandidate(
      input.wikiId,
      proposed.source.parent_id,
      proposed.source.title,
    );
  if (sourceMatches.results.length > 1)
    throw new AppError(
      "validation_error",
      "More than one source page uses this source URL.",
      409,
      {
        source_url: proposed.source.source_url,
        next_action: "Resolve duplicate source pages before ingesting.",
      },
    );
  if (
    sourceMatches.results.length === 0 &&
    sourceSibling &&
    sourceSibling.source_url !== proposed.source.source_url
  )
    throw new AppError(
      "validation_error",
      "A sibling page already uses the proposed source title for different content.",
      409,
      {
        page_id: sourceSibling.id,
        next_action: "Choose a unique source title or reuse the existing URL.",
      },
    );
  const existingSource = sourceMatches.results[0] ?? null,
    sourceAction: PlannedPageAction = {
      action_id: uuid(),
      operation_id: uuid(),
      role: "source",
      kind: existingSource ? "reuse" : "create",
      page: proposed.source,
      target_page_id: existingSource?.id ?? null,
      expected_version: existingSource?.version ?? null,
    },
    pageActions: PlannedPageAction[] = [];
  for (const page of proposed.pages) {
    const existing = await siblingCandidate(
      input.wikiId,
      page.parent_id,
      page.title,
    );
    if (existing?.page_type === "source" || existing?.page_type === "folder")
      throw new AppError(
        "validation_error",
        "A protected sibling page already uses the proposed knowledge title.",
        409,
        { page_id: existing.id, title: page.title },
      );
    if (existing && existing.page_type !== page.page_type)
      throw new AppError(
        "validation_error",
        "An existing canonical page has a different page type.",
        409,
        {
          page_id: existing.id,
          existing_page_type: existing.page_type,
          proposed_page_type: page.page_type,
          next_action: "Keep the existing type or rename the proposed page.",
        },
      );
    const classification = classifyIngestPageAction(existing ?? null);
    pageActions.push({
      action_id: uuid(),
      operation_id: uuid(),
      role: "knowledge",
      kind: classification.kind,
      page,
      target_page_id: classification.target_page_id,
      expected_version: classification.expected_version,
    });
  }
  const plannedTitles = new Set([
    titleKey(proposed.source.title),
    ...proposed.pages.map((page) => titleKey(page.title)),
  ]);
  for (const claim of proposed.claims) {
    if (
      claim.subject.title &&
      !plannedTitles.has(titleKey(claim.subject.title))
    )
      await resolvePageReference(input.wikiId, claim.subject);
    if (claim.object.title && !plannedTitles.has(titleKey(claim.object.title)))
      await resolvePageReference(input.wikiId, claim.object);
    if (claim.subject.page_id)
      await getPage(input.wikiId, claim.subject.page_id);
    if (claim.object.page_id) await getPage(input.wikiId, claim.object.page_id);
    if (claim.source_page_id) {
      const source = await getPage(input.wikiId, claim.source_page_id);
      if (source.page_type !== "source")
        throw new AppError(
          "validation_error",
          "A claim source_page_id must reference a source page.",
          400,
          { source_page_id: claim.source_page_id },
        );
    }
    if (claim.supersedes_claim_id)
      await getClaim(input.wikiId, claim.supersedes_claim_id);
  }
  const warnings: StoredIngestPlan["warnings"] = [];
  if (proposed.source.retrieval_status !== "success")
    warnings.push({
      code: "incomplete_retrieval",
      message: `Source retrieval status is ${proposed.source.retrieval_status}.`,
    });
  if (proposed.source.confidence < contract.minimum_source_confidence)
    warnings.push({
      code: "low_source_confidence",
      message: `Source confidence is below the vault threshold ${contract.minimum_source_confidence}.`,
    });
  const plan: StoredIngestPlan = {
      source_action: sourceAction,
      page_actions: pageActions,
      claim_actions: proposed.claims.map((claim) => ({
        action_id: uuid(),
        claim_id: uuid(),
        claim,
      })),
      knowledge_map_action: proposed.knowledge_map_patch
        ? { action_id: uuid(), patch: proposed.knowledge_map_patch }
        : null,
      warnings,
    },
    planJson = stableJson(plan),
    planHash = await canonicalIngestPlanHash(plan),
    planId = uuid(),
    createdAt = now(),
    expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await db().batch([
    db()
      .prepare(
        `INSERT INTO ingest_plans(id,wiki_id,actor_email,status,plan_json,plan_hash,action_state_json,created_at,expires_at) VALUES(?,?,?,'planned',?,?,'{"completed":{},"page_ids_by_title":{}}',?,?)`,
      )
      .bind(
        planId,
        input.wikiId,
        input.email,
        planJson,
        planHash,
        createdAt,
        expiresAt,
      ),
    db()
      .prepare(
        `INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) VALUES(?,?,?,?,'ingest.plan','ingest_plan',?,'success',?,?,?)`,
      )
      .bind(
        uuid(),
        input.wikiId,
        input.email,
        input.origin,
        planId,
        input.requestId,
        JSON.stringify({
          page_action_count: pageActions.length + 1,
          claim_action_count: proposed.claims.length,
          knowledge_map_action_count: proposed.knowledge_map_patch ? 1 : 0,
          warning_count: warnings.length,
        }),
        createdAt,
      ),
  ]);
  return {
    plan_id: planId,
    plan_hash: planHash,
    status: "planned",
    expires_at: expiresAt,
    source_action: {
      kind: sourceAction.kind,
      title: proposed.source.title,
      target_page_id: sourceAction.target_page_id,
      expected_version: sourceAction.expected_version,
    },
    page_actions: pageActions.map((action) => ({
      kind: action.kind,
      title: action.page.title,
      page_type: (action.page as IngestPageDraft).page_type,
      target_page_id: action.target_page_id,
      expected_version: action.expected_version,
    })),
    claim_count: proposed.claims.length,
    knowledge_map_change: proposed.knowledge_map_patch
      ? {
          expected_version: proposed.knowledge_map_patch.expected_version,
          topic_count: proposed.knowledge_map_patch.topics.length,
          placement_count: proposed.knowledge_map_patch.placements.length,
          removal_count:
            proposed.knowledge_map_patch.remove_placement_ids.length,
          overview_brief_changed: Object.prototype.hasOwnProperty.call(
            proposed.knowledge_map_patch,
            "overview_brief",
          ),
          topic_brief_count:
            proposed.knowledge_map_patch.topic_briefs?.length ?? 0,
        }
      : null,
    warnings,
    mutation_count:
      pageActions.length +
      (existingSource ? 0 : 1) +
      proposed.claims.length +
      (proposed.knowledge_map_patch ? 1 : 0),
  };
}

async function resolvePageReference(
  wikiId: string,
  reference: { page_id?: string; title?: string; value?: string },
  state?: IngestActionState,
) {
  if (reference.page_id) return getPage(wikiId, reference.page_id);
  if (!reference.title)
    throw new AppError(
      "validation_error",
      "A page reference is missing page_id or title.",
      400,
    );
  const plannedId = state?.page_ids_by_title[titleKey(reference.title)];
  if (plannedId) return getPage(wikiId, plannedId);
  const matches = await db()
    .prepare(
      `SELECT ${PAGE_COLUMNS} FROM pages WHERE wiki_id=? AND lower(title)=lower(?) AND deleted_at IS NULL ORDER BY created_at LIMIT 2`,
    )
    .bind(wikiId, reference.title)
    .all<PageRow>();
  if (matches.results.length !== 1)
    throw new AppError(
      "validation_error",
      "A title claim reference must resolve to exactly one active page.",
      409,
      { title: reference.title, match_count: matches.results.length },
    );
  return mapPage(matches.results[0]);
}

async function getClaim(wikiId: string, claimId: string) {
  const claim = await db()
    .prepare(
      `SELECT id,wiki_id,subject_page_id,predicate,object_page_id,object_value,source_page_id,evidence_fragment,confidence,observed_at,valid_from,valid_to,supersedes_claim_id,created_by,created_at,updated_at FROM knowledge_claims WHERE id=? AND wiki_id=? AND deleted_at IS NULL`,
    )
    .bind(claimId, wikiId)
    .first<Record<string, unknown>>();
  if (!claim)
    throw new AppError("not_found", "The requested claim was not found.", 404, {
      claim_id: claimId,
    });
  return claim;
}

async function saveIngestState(planId: string, state: IngestActionState) {
  await db()
    .prepare(`UPDATE ingest_plans SET action_state_json=? WHERE id=?`)
    .bind(stableJson(state), planId)
    .run();
}

export async function applyIngestPlan(input: {
  wikiId: string;
  email: string;
  planId: string;
  planHash: string;
  approved: boolean;
  operationId: string;
  requestId: string;
  origin: "human" | "webmcp";
}) {
  if (!input.approved)
    throw new AppError(
      "validation_error",
      "approved must be true before an ingest plan can be applied.",
      400,
      { field: "approved" },
    );
  const row = await db()
    .prepare(
      `SELECT id,wiki_id,actor_email,status,plan_json,plan_hash,action_state_json,apply_operation_id,failure_code,expires_at,applied_at FROM ingest_plans WHERE id=? AND wiki_id=? AND actor_email=?`,
    )
    .bind(input.planId, input.wikiId, input.email)
    .first<{
      id: string;
      wiki_id: string;
      actor_email: string;
      status: string;
      plan_json: string;
      plan_hash: string;
      action_state_json: string;
      apply_operation_id: string | null;
      failure_code: string | null;
      expires_at: string;
      applied_at: string | null;
    }>();
  if (!row)
    throw new AppError("not_found", "The ingest plan was not found.", 404, {
      plan_id: input.planId,
    });
  if (row.plan_hash !== input.planHash)
    throw new AppError(
      "validation_error",
      "The ingest plan hash does not match the persisted plan.",
      409,
      { plan_id: input.planId },
    );
  if (row.status !== "applied" && isIngestPlanExpired(row.expires_at))
    throw new AppError(
      "validation_error",
      "The ingest plan has expired.",
      409,
      { plan_id: input.planId, next_action: "Create and review a new plan." },
    );
  const state = JSON.parse(row.action_state_json) as IngestActionState;
  if (row.status === "applied")
    return {
      plan_id: row.id,
      plan_hash: row.plan_hash,
      status: "applied",
      applied_at: row.applied_at,
      completed_actions: Object.values(state.completed),
      replayed: true,
    };
  if (row.apply_operation_id && row.apply_operation_id !== input.operationId)
    throw new AppError(
      "idempotency_pending",
      "This plan already has an apply operation. Retry with the original operation_id.",
      409,
      { plan_id: input.planId },
      true,
    );
  const operationName = "wiki_apply_ingest",
    reservation = await reserveIdempotency({
      ...input,
      operationName,
      payload: {
        plan_id: input.planId,
        plan_hash: input.planHash,
        approved: true,
      },
    });
  if (reservation.cached) return reservation.cached;
  await db()
    .prepare(
      `UPDATE ingest_plans SET status='applying',apply_operation_id=?,failure_code=NULL WHERE id=? AND wiki_id=? AND actor_email=?`,
    )
    .bind(input.operationId, input.planId, input.wikiId, input.email)
    .run();
  const plan = JSON.parse(row.plan_json) as StoredIngestPlan,
    pageActions = [plan.source_action, ...plan.page_actions];
  try {
    if (plan.knowledge_map_action)
      await validateKnowledgeMapPatch({
        wikiId: input.wikiId,
        patch: plan.knowledge_map_action.patch,
        pendingPageTitles: new Set(
          pageActions.map((action) => titleKey(action.page.title)),
        ),
      });
    for (const action of pageActions) {
      if (state.completed[action.action_id]) continue;
      let pageId: string, version: number;
      if (action.kind === "reuse") {
        const page = await getPage(input.wikiId, action.target_page_id!);
        pageId = page.id;
        version = page.version;
      } else if (action.kind === "create") {
        const page = action.page;
        const result = await createPage({
          wikiId: input.wikiId,
          email: input.email,
          title: page.title,
          pageType:
            action.role === "source"
              ? "source"
              : (page as IngestPageDraft).page_type,
          markdown: page.markdown,
          parentId: page.parent_id,
          operationId: action.operation_id,
          requestId: input.requestId,
          origin: input.origin,
          ...(action.role === "source"
            ? {
                sourceUrl: (page as IngestSourceDraft).source_url,
                retrievalStatus: (page as IngestSourceDraft).retrieval_status,
                retrievedAt: (page as IngestSourceDraft).retrieved_at,
                extractionMethod: (page as IngestSourceDraft).extraction_method,
                confidence: (page as IngestSourceDraft).confidence,
              }
            : {}),
        });
        pageId = result.page_id;
        version = result.version;
      } else {
        const result = await updatePage({
          wikiId: input.wikiId,
          email: input.email,
          pageId: action.target_page_id!,
          expectedVersion: action.expected_version!,
          markdown: action.page.markdown,
          changeSummary: "Applied reviewed LLM Wiki ingest plan",
          operationId: action.operation_id,
          requestId: input.requestId,
          origin: input.origin,
        });
        pageId = result.page_id;
        version = result.version;
      }
      state.completed[action.action_id] = {
        kind: "page",
        page_id: pageId,
        version,
      };
      state.page_ids_by_title[titleKey(action.page.title)] = pageId;
      await saveIngestState(input.planId, state);
    }
    for (const action of plan.claim_actions) {
      if (state.completed[action.action_id]) continue;
      const claim = action.claim,
        subject = await resolvePageReference(
          input.wikiId,
          claim.subject,
          state,
        ),
        objectPage = claim.object.value
          ? null
          : await resolvePageReference(input.wikiId, claim.object, state),
        source = claim.source_page_id
          ? await getPage(input.wikiId, claim.source_page_id)
          : await getPage(
              input.wikiId,
              state.page_ids_by_title[titleKey(plan.source_action.page.title)],
            );
      if (source.page_type !== "source")
        throw new AppError(
          "validation_error",
          "A claim source must be an active source page.",
          409,
          { source_page_id: source.id },
        );
      if (claim.supersedes_claim_id)
        await getClaim(input.wikiId, claim.supersedes_claim_id);
      const timestamp = now();
      await db().batch([
        db()
          .prepare(
            `INSERT OR IGNORE INTO knowledge_claims(id,wiki_id,subject_page_id,predicate,object_page_id,object_value,source_page_id,evidence_fragment,confidence,observed_at,valid_from,valid_to,supersedes_claim_id,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .bind(
            action.claim_id,
            input.wikiId,
            subject.id,
            claim.predicate,
            objectPage?.id ?? null,
            claim.object.value ?? null,
            source.id,
            claim.evidence_fragment,
            claim.confidence,
            claim.observed_at,
            claim.valid_from,
            claim.valid_to,
            claim.supersedes_claim_id,
            input.email,
            timestamp,
            timestamp,
          ),
        db()
          .prepare(
            `INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) VALUES(?,?,?,?, 'claim.create','claim',?,'success',?,?,?)`,
          )
          .bind(
            uuid(),
            input.wikiId,
            input.email,
            input.origin,
            action.claim_id,
            input.requestId,
            JSON.stringify({
              subject_page_id: subject.id,
              source_page_id: source.id,
            }),
            timestamp,
          ),
      ]);
      state.completed[action.action_id] = {
        kind: "claim",
        claim_id: action.claim_id,
      };
      await saveIngestState(input.planId, state);
    }
    if (
      plan.knowledge_map_action &&
      !state.completed[plan.knowledge_map_action.action_id]
    ) {
      const mapResult = await applyKnowledgeMapPatch({
        wikiId: input.wikiId,
        email: input.email,
        patch: plan.knowledge_map_action.patch,
        requestId: input.requestId,
        origin: input.origin,
        pageState: state,
        operationId: plan.knowledge_map_action.action_id,
      });
      state.completed[plan.knowledge_map_action.action_id] = {
        kind: "knowledge_map",
        version: mapResult.version,
      };
      await saveIngestState(input.planId, state);
    }
    const appliedAt = now(),
      result = {
        plan_id: input.planId,
        plan_hash: input.planHash,
        status: "applied",
        applied_at: appliedAt,
        completed_actions: Object.values(state.completed),
        page_ids_by_title: state.page_ids_by_title,
        replayed: false,
      };
    await db().batch([
      db()
        .prepare(
          `UPDATE ingest_plans SET status='applied',action_state_json=?,applied_at=?,failure_code=NULL WHERE id=? AND wiki_id=? AND actor_email=?`,
        )
        .bind(
          stableJson(state),
          appliedAt,
          input.planId,
          input.wikiId,
          input.email,
        ),
      db()
        .prepare(
          `UPDATE idempotency_keys SET status='completed',result_json=?,completed_at=? WHERE wiki_id=? AND actor_email=? AND operation_name=? AND operation_id=?`,
        )
        .bind(
          JSON.stringify(result),
          appliedAt,
          input.wikiId,
          input.email,
          operationName,
          input.operationId,
        ),
      db()
        .prepare(
          `INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) VALUES(?,?,?,?, 'ingest.apply','ingest_plan',?,'success',?,?,?)`,
        )
        .bind(
          uuid(),
          input.wikiId,
          input.email,
          input.origin,
          input.planId,
          input.requestId,
          JSON.stringify({
            completed_actions: Object.keys(state.completed).length,
          }),
          appliedAt,
        ),
    ]);
    return result;
  } catch (error) {
    const appError =
      error instanceof AppError
        ? error
        : new AppError(
            "internal_error",
            "The ingest plan could not be fully applied.",
            500,
            { plan_id: input.planId },
            true,
          );
    await db()
      .prepare(
        `UPDATE ingest_plans SET status='failed',failure_code=?,action_state_json=? WHERE id=?`,
      )
      .bind(appError.code, stableJson(state), input.planId)
      .run();
    await failIdempotency({ ...input, operationName, error: appError });
    throw appError;
  }
}

export async function listKnowledgeClaims(input: {
  wikiId: string;
  subjectPageId: string | null;
  sourcePageId: string | null;
  limit: number;
  offset: number;
}) {
  const filters = ["wiki_id=?", "deleted_at IS NULL"],
    binds: unknown[] = [input.wikiId];
  if (input.subjectPageId) {
    filters.push("subject_page_id=?");
    binds.push(input.subjectPageId);
  }
  if (input.sourcePageId) {
    filters.push("source_page_id=?");
    binds.push(input.sourcePageId);
  }
  const where = filters.join(" AND "),
    [claims, count] = await Promise.all([
      db()
        .prepare(
          `SELECT id,wiki_id,subject_page_id,predicate,object_page_id,object_value,source_page_id,evidence_fragment,confidence,observed_at,valid_from,valid_to,supersedes_claim_id,created_by,created_at,updated_at FROM knowledge_claims WHERE ${where} ORDER BY created_at DESC,id LIMIT ? OFFSET ?`,
        )
        .bind(...binds, input.limit, input.offset)
        .all(),
      db()
        .prepare(
          `SELECT COUNT(*) AS total FROM knowledge_claims WHERE ${where}`,
        )
        .bind(...binds)
        .first<{ total: number }>(),
    ]);
  return { claims: claims.results, total: Number(count?.total ?? 0) };
}

export async function lintWiki(input: { wikiId: string; limit: number }) {
  const [pages, links, claims, contract] = await Promise.all([
    db()
      .prepare(
        `SELECT id,parent_id,title,slug,page_type,source_url,retrieval_status,retrieved_at,extraction_method,confidence FROM pages WHERE wiki_id=? AND deleted_at IS NULL ORDER BY parent_key,sort_order,title LIMIT 5000`,
      )
      .bind(input.wikiId)
      .all<{
        id: string;
        parent_id: string | null;
        title: string;
        slug: string;
        page_type: PageType;
        source_url: string | null;
        retrieval_status: RetrievalStatus | null;
        retrieved_at: string | null;
        extraction_method: string | null;
        confidence: number | null;
      }>(),
    db()
      .prepare(
        `SELECT l.source_page_id,CASE WHEN EXISTS(SELECT 1 FROM pages p WHERE p.id=l.target_page_id AND p.wiki_id=l.wiki_id AND p.deleted_at IS NULL) THEN l.target_page_id ELSE NULL END AS target_page_id,l.target_text FROM page_links l WHERE l.wiki_id=? LIMIT 20000`,
      )
      .bind(input.wikiId)
      .all<{
        source_page_id: string;
        target_page_id: string | null;
        target_text: string;
      }>(),
    db()
      .prepare(
        `SELECT id,subject_page_id,source_page_id,valid_to FROM knowledge_claims WHERE wiki_id=? AND deleted_at IS NULL LIMIT 20000`,
      )
      .bind(input.wikiId)
      .all<{
        id: string;
        subject_page_id: string;
        source_page_id: string;
        valid_to: string | null;
      }>(),
    getOperatingContract(input.wikiId),
  ]);
  return buildWikiLintReport({
    pages: pages.results,
    links: links.results,
    claims: claims.results,
    contract: contract.contract,
    limit: input.limit,
  });
}

type AttachmentRow = {
  id: string;
  wiki_id: string;
  page_id: string | null;
  object_key: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  uploaded_by: string;
  status: string;
  created_at: string;
  deleted_at: string | null;
};
export async function listAttachments(
  wikiId: string,
  pageId: string | null,
  includeDeleted = false,
) {
  const rows = await db()
    .prepare(
      `SELECT id,wiki_id,page_id,object_key,filename,mime_type,size_bytes,sha256,uploaded_by,status,created_at,deleted_at FROM attachments WHERE wiki_id=? AND (? IS NULL OR page_id=?) AND (?=1 OR status='ready') ORDER BY created_at DESC LIMIT 200`,
    )
    .bind(wikiId, pageId, pageId, includeDeleted ? 1 : 0)
    .all<AttachmentRow>();
  return rows.results.map(({ object_key, ...row }) => {
    void object_key;
    return row;
  });
}
export async function getAttachment(wikiId: string, attachmentId: string) {
  const row = await db()
    .prepare(
      `SELECT id,wiki_id,page_id,object_key,filename,mime_type,size_bytes,sha256,uploaded_by,status,created_at,deleted_at FROM attachments WHERE id=? AND wiki_id=? AND status='ready'`,
    )
    .bind(attachmentId, wikiId)
    .first<AttachmentRow>();
  if (!row)
    throw new AppError(
      "not_found",
      "The requested attachment was not found.",
      404,
      { attachment_id: attachmentId },
    );
  const object = await env.FILES?.get(row.object_key);
  if (!object)
    throw new AppError(
      "retryable_storage_error",
      "The attachment object is missing.",
      503,
      { attachment_id: attachmentId },
      false,
    );
  const data = await object.arrayBuffer();
  if ((await sha256Bytes(data)) !== row.sha256)
    throw new AppError(
      "retryable_storage_error",
      "The attachment failed checksum verification.",
      503,
      { attachment_id: attachmentId },
      false,
    );
  return { row, data };
}

export async function uploadAttachment(input: {
  wikiId: string;
  email: string;
  pageId: string | null;
  filename: string;
  mimeType: string;
  data: ArrayBuffer;
  operationId: string;
  requestId: string;
  origin: "human" | "webmcp";
}) {
  if (input.pageId) await getPage(input.wikiId, input.pageId);
  if (!env.FILES)
    throw new AppError(
      "retryable_storage_error",
      "Attachment storage is unavailable.",
      503,
      {},
      true,
    );
  await assertAttachmentQuota(input.wikiId, input.data.byteLength);
  const hash = await sha256Bytes(input.data),
    operationName = "attachment_upload",
    payload = {
      page_id: input.pageId,
      filename: input.filename,
      mime_type: input.mimeType,
      size_bytes: input.data.byteLength,
      sha256: hash,
    },
    reservation = await reserveIdempotency({
      ...input,
      operationName,
      payload,
    });
  if (reservation.cached)
    return {
      attachment: reservation.cached as unknown as {
        attachment_id: string;
        filename: string;
        mime_type: string;
        size_bytes: number;
        sha256: string;
      },
      uploaded: false,
    };
  const attachmentId = uuid(),
    key = `attachments/${input.wikiId}/${attachmentId}`,
    timestamp = now(),
    d = db(),
    result = {
      attachment_id: attachmentId,
      filename: input.filename,
      mime_type: input.mimeType,
      size_bytes: input.data.byteLength,
      sha256: hash,
    };
  await d.batch([
    d
      .prepare(
        `INSERT INTO attachments(id,wiki_id,page_id,object_key,filename,mime_type,size_bytes,sha256,uploaded_by,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,'pending',?)`,
      )
      .bind(
        attachmentId,
        input.wikiId,
        input.pageId,
        key,
        input.filename,
        input.mimeType,
        input.data.byteLength,
        hash,
        input.email,
        timestamp,
      ),
    d
      .prepare(
        `UPDATE wiki_usage SET r2_pending_bytes=r2_pending_bytes+?,updated_at=? WHERE wiki_id=?`,
      )
      .bind(input.data.byteLength, timestamp, input.wikiId),
  ]);
  try {
    await env.FILES.put(key, input.data, {
      httpMetadata: { contentType: input.mimeType },
      customMetadata: { sha256: hash, filename: input.filename },
    });
    const saved = await env.FILES.get(key);
    if (!saved || (await sha256Bytes(await saved.arrayBuffer())) !== hash)
      throw new AppError(
        "retryable_storage_error",
        "The attachment checksum could not be verified.",
        503,
        {},
        true,
      );
    await d.batch([
      d
        .prepare(
          `UPDATE attachments SET status='ready' WHERE id=? AND wiki_id=? AND status='pending'`,
        )
        .bind(attachmentId, input.wikiId),
      d
        .prepare(
          `UPDATE wiki_usage SET r2_pending_bytes=MAX(r2_pending_bytes-?,0),r2_ready_attachment_bytes=r2_ready_attachment_bytes+?,attachment_count=attachment_count+1,updated_at=? WHERE wiki_id=?`,
        )
        .bind(
          input.data.byteLength,
          input.data.byteLength,
          timestamp,
          input.wikiId,
        ),
      d
        .prepare(
          `INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) VALUES(?,?,?,?,'attachment.upload','attachment',?,'success',?,?,?)`,
        )
        .bind(
          uuid(),
          input.wikiId,
          input.email,
          input.origin,
          attachmentId,
          input.requestId,
          JSON.stringify({
            filename: input.filename,
            size_bytes: input.data.byteLength,
            sha256: hash,
          }),
          timestamp,
        ),
      d
        .prepare(
          `UPDATE idempotency_keys SET status='completed',result_json=?,completed_at=? WHERE wiki_id=? AND actor_email=? AND operation_name=? AND operation_id=?`,
        )
        .bind(
          JSON.stringify(result),
          timestamp,
          input.wikiId,
          input.email,
          operationName,
          input.operationId,
        ),
    ]);
    return { attachment: result, uploaded: true };
  } catch (error) {
    try {
      await env.FILES.delete(key);
    } catch (cleanupError) {
      await d
        .prepare(
          `INSERT INTO storage_repairs(id,wiki_id,object_key,kind,status,last_error,created_at,updated_at) VALUES(?,?,?,'delete_orphan','pending',?,?,?)`,
        )
        .bind(
          uuid(),
          input.wikiId,
          key,
          safeOperationalErrorTag(cleanupError),
          now(),
          now(),
        )
        .run();
    }
    await d.batch([
      d
        .prepare(`UPDATE attachments SET status='failed' WHERE id=?`)
        .bind(attachmentId),
      d
        .prepare(
          `UPDATE wiki_usage SET r2_pending_bytes=MAX(r2_pending_bytes-?,0),updated_at=? WHERE wiki_id=?`,
        )
        .bind(input.data.byteLength, now(), input.wikiId),
    ]);
    const appError =
      error instanceof AppError
        ? error
        : new AppError(
            "retryable_storage_error",
            "The attachment upload could not be completed.",
            503,
            {},
            true,
          );
    await failIdempotency({ ...input, operationName, error: appError });
    throw appError;
  }
}

export async function softDeleteAttachment(input: {
  wikiId: string;
  email: string;
  attachmentId: string;
  operationId: string;
  requestId: string;
  origin: "human" | "webmcp";
}) {
  const operationName = "attachment_soft_delete",
    payload = { attachment_id: input.attachmentId },
    reservation = await reserveIdempotency({
      ...input,
      operationName,
      payload,
    });
  if (reservation.cached) return reservation.cached;
  const row = await db()
    .prepare(
      `SELECT id,size_bytes FROM attachments WHERE id=? AND wiki_id=? AND status='ready'`,
    )
    .bind(input.attachmentId, input.wikiId)
    .first<{ id: string; size_bytes: number }>();
  if (!row) {
    const error = new AppError(
      "not_found",
      "The requested attachment was not found.",
      404,
      { attachment_id: input.attachmentId },
    );
    await failIdempotency({ ...input, operationName, error });
    throw error;
  }
  const timestamp = now(),
    result = {
      attachment_id: input.attachmentId,
      status: "soft_deleted",
      deleted_at: timestamp,
    };
  await db().batch([
    db()
      .prepare(
        `UPDATE attachments SET status='soft_deleted',deleted_at=? WHERE id=? AND wiki_id=? AND status='ready'`,
      )
      .bind(timestamp, input.attachmentId, input.wikiId),
    db()
      .prepare(
        `UPDATE wiki_usage SET r2_ready_attachment_bytes=MAX(r2_ready_attachment_bytes-?,0),r2_soft_deleted_bytes=r2_soft_deleted_bytes+?,attachment_count=MAX(attachment_count-1,0),updated_at=? WHERE wiki_id=?`,
      )
      .bind(row.size_bytes, row.size_bytes, timestamp, input.wikiId),
    db()
      .prepare(
        `INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) VALUES(?,?,?,?,'attachment.soft_delete','attachment',?,'success',?,'{}',?)`,
      )
      .bind(
        uuid(),
        input.wikiId,
        input.email,
        input.origin,
        input.attachmentId,
        input.requestId,
        timestamp,
      ),
    db()
      .prepare(
        `UPDATE idempotency_keys SET status='completed',result_json=?,completed_at=? WHERE wiki_id=? AND actor_email=? AND operation_name=? AND operation_id=?`,
      )
      .bind(
        JSON.stringify(result),
        timestamp,
        input.wikiId,
        input.email,
        operationName,
        input.operationId,
      ),
  ]);
  return result;
}

export async function restoreAttachment(input: {
  wikiId: string;
  email: string;
  attachmentId: string;
  operationId: string;
  requestId: string;
  origin: "human" | "webmcp";
}) {
  const operationName = "attachment_restore",
    payload = { attachment_id: input.attachmentId },
    reservation = await reserveIdempotency({
      ...input,
      operationName,
      payload,
    });
  if (reservation.cached) return reservation.cached;
  const row = await db()
    .prepare(
      `SELECT id,object_key,size_bytes,deleted_at FROM attachments WHERE id=? AND wiki_id=? AND status='soft_deleted'`,
    )
    .bind(input.attachmentId, input.wikiId)
    .first<{
      id: string;
      object_key: string;
      size_bytes: number;
      deleted_at: string;
    }>();
  if (!row) {
    const error = new AppError(
      "not_found",
      "The deleted attachment was not found.",
      404,
      { attachment_id: input.attachmentId },
    );
    await failIdempotency({ ...input, operationName, error });
    throw error;
  }
  if (Date.now() - new Date(row.deleted_at).getTime() > 30 * 86_400_000) {
    const error = new AppError(
      "not_found",
      "The attachment restore window has expired.",
      410,
      { attachment_id: input.attachmentId },
    );
    await failIdempotency({ ...input, operationName, error });
    throw error;
  }
  if (!(await env.FILES?.head(row.object_key))) {
    const error = new AppError(
      "retryable_storage_error",
      "The attachment object is missing.",
      503,
      { attachment_id: input.attachmentId },
      false,
    );
    await failIdempotency({ ...input, operationName, error });
    throw error;
  }
  try {
    await assertAttachmentQuota(input.wikiId, 0);
  } catch (error) {
    const appError =
      error instanceof AppError
        ? error
        : new AppError(
            "internal_error",
            "The attachment quota could not be checked.",
            500,
          );
    await failIdempotency({ ...input, operationName, error: appError });
    throw appError;
  }
  const timestamp = now(),
    result = { attachment_id: input.attachmentId, status: "ready" };
  await db().batch([
    db()
      .prepare(
        `UPDATE attachments SET status='ready',deleted_at=NULL WHERE id=? AND wiki_id=? AND status='soft_deleted'`,
      )
      .bind(input.attachmentId, input.wikiId),
    db()
      .prepare(
        `UPDATE wiki_usage SET r2_soft_deleted_bytes=MAX(r2_soft_deleted_bytes-?,0),r2_ready_attachment_bytes=r2_ready_attachment_bytes+?,attachment_count=attachment_count+1,updated_at=? WHERE wiki_id=?`,
      )
      .bind(row.size_bytes, row.size_bytes, timestamp, input.wikiId),
    db()
      .prepare(
        `INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) VALUES(?,?,?,?,'attachment.restore','attachment',?,'success',?,'{}',?)`,
      )
      .bind(
        uuid(),
        input.wikiId,
        input.email,
        input.origin,
        input.attachmentId,
        input.requestId,
        timestamp,
      ),
    db()
      .prepare(
        `UPDATE idempotency_keys SET status='completed',result_json=?,completed_at=? WHERE wiki_id=? AND actor_email=? AND operation_name=? AND operation_id=?`,
      )
      .bind(
        JSON.stringify(result),
        timestamp,
        input.wikiId,
        input.email,
        operationName,
        input.operationId,
      ),
  ]);
  return result;
}

type ExportPart = {
  number: number;
  kind: "metadata" | "attachment" | "revision";
  filename: string;
  size_bytes: number;
  sha256: string;
  object_key: string;
  revision_id?: string;
};
type StoredExportManifest = {
  schema_version: number;
  backup_run_id: string;
  exported_at: string;
  wiki_id: string;
  profile: "portable" | "full";
  page_count: number;
  attachment_count: number;
  revision_count: number;
  parts: ExportPart[];
  manifest_hash: string;
};
function publicExportManifest(manifest: StoredExportManifest) {
  return {
    ...manifest,
    parts: manifest.parts.map(({ object_key, revision_id, ...part }) => {
      void object_key;
      void revision_id;
      return {
        ...part,
        url: `/api/export/stream?backup_run_id=${encodeURIComponent(manifest.backup_run_id)}&part=${part.number}`,
      };
    }),
  };
}
async function putVerified(key: string, data: string, contentType: string) {
  if (!env.FILES)
    throw new AppError(
      "retryable_storage_error",
      "Backup storage is unavailable.",
      503,
      {},
      true,
    );
  const hash = await sha256(data);
  await env.FILES.put(key, data, {
    httpMetadata: { contentType },
    customMetadata: { sha256: hash },
  });
  const saved = await env.FILES.get(key);
  if (!saved || (await sha256(await saved.text())) !== hash) {
    await env.FILES.delete(key);
    throw new AppError(
      "retryable_storage_error",
      "A backup part failed checksum verification.",
      503,
      { object_key: key },
      true,
    );
  }
  return { hash, size_bytes: bytes(data) };
}

async function readVerifiedRevisionObject(
  key: string,
  expectedHash: string,
  details: Record<string, unknown>,
) {
  const object = await env.FILES?.get(key);
  if (!object)
    throw new AppError(
      "retryable_storage_error",
      "A revision snapshot object is missing.",
      503,
      details,
      false,
    );
  const data = await object.arrayBuffer();
  if ((await sha256Bytes(data)) !== expectedHash)
    throw new AppError(
      "retryable_storage_error",
      "A revision snapshot failed checksum verification.",
      503,
      details,
      false,
    );
  return {
    markdown: new TextDecoder().decode(data),
    size_bytes: data.byteLength,
  };
}

export async function prepareExport(input: {
  wikiId: string;
  email: string;
  profile: "portable" | "full";
  includeMemberReference: boolean;
  requestId: string;
}) {
  if (!env.FILES)
    throw new AppError(
      "retryable_storage_error",
      "Backup storage is unavailable.",
      503,
      {},
      true,
    );
  const d = db(),
    runId = uuid(),
    timestamp = now(),
    wiki = await d
      .prepare(
        `SELECT id,slug,title,created_at,updated_at FROM wikis WHERE id=? AND status='active'`,
      )
      .bind(input.wikiId)
      .first(),
    pages = await d
      .prepare(
        `SELECT id,parent_id,slug,title,page_type,markdown,source_url,retrieval_status,retrieved_at,extraction_method,confidence,frontmatter_json,version,sort_order,created_at,updated_at FROM pages WHERE wiki_id=? AND deleted_at IS NULL ORDER BY parent_key,sort_order,title`,
      )
      .bind(input.wikiId)
      .all(),
    links = await d
      .prepare(
        `SELECT source_page_id,target_page_id,target_text,link_kind FROM page_links WHERE wiki_id=? AND EXISTS(SELECT 1 FROM pages p WHERE p.id=source_page_id AND p.deleted_at IS NULL)`,
      )
      .bind(input.wikiId)
      .all(),
    operatingContract = await d
      .prepare(
        `SELECT version,contract_json,updated_by,updated_at FROM wiki_operating_contracts WHERE wiki_id=?`,
      )
      .bind(input.wikiId)
      .first<{
        version: number;
        contract_json: string;
        updated_by: string;
        updated_at: string;
      }>(),
    claims = await d
      .prepare(
        `SELECT id,subject_page_id,predicate,object_page_id,object_value,source_page_id,evidence_fragment,confidence,observed_at,valid_from,valid_to,supersedes_claim_id,created_by,created_at,updated_at FROM knowledge_claims c WHERE c.wiki_id=? AND c.deleted_at IS NULL AND EXISTS(SELECT 1 FROM pages p WHERE p.id=c.subject_page_id AND p.wiki_id=c.wiki_id AND p.deleted_at IS NULL) AND EXISTS(SELECT 1 FROM pages p WHERE p.id=c.source_page_id AND p.wiki_id=c.wiki_id AND p.deleted_at IS NULL) AND (c.object_page_id IS NULL OR EXISTS(SELECT 1 FROM pages p WHERE p.id=c.object_page_id AND p.wiki_id=c.wiki_id AND p.deleted_at IS NULL)) ORDER BY c.created_at,c.id`,
      )
      .bind(input.wikiId)
      .all(),
    knowledgeMap = await d
      .prepare(
        `SELECT version,overview_brief_json,overview_brief_basis_hash,updated_by,updated_at FROM knowledge_maps WHERE wiki_id=?`,
      )
      .bind(input.wikiId)
      .first<{
        version: number;
        overview_brief_json: string | null;
        overview_brief_basis_hash: string | null;
        updated_by: string;
        updated_at: string;
      }>(),
    knowledgeTopics = knowledgeMap
      ? await d
          .prepare(
            `SELECT id,parent_topic_id,title,summary,presentation,sort_order,is_locked,insight_brief_json,insight_brief_basis_hash,created_by,updated_by,created_at,updated_at FROM knowledge_topics WHERE wiki_id=? AND deleted_at IS NULL ORDER BY parent_topic_id,sort_order,title`,
          )
          .bind(input.wikiId)
          .all()
      : { results: [] },
    knowledgePlacements = knowledgeMap
      ? await d
          .prepare(
            `SELECT id,topic_id,page_id,role,summary,sort_order,is_locked,created_by,updated_by,created_at,updated_at FROM knowledge_placements WHERE wiki_id=? AND deleted_at IS NULL ORDER BY topic_id,sort_order,id`,
          )
          .bind(input.wikiId)
          .all()
      : { results: [] },
    attachments = await d
      .prepare(
        `SELECT id,page_id,object_key,filename,mime_type,size_bytes,sha256,created_at FROM attachments WHERE wiki_id=? AND status='ready' ORDER BY created_at`,
      )
      .bind(input.wikiId)
      .all<AttachmentRow>();
  const revisions =
    input.profile === "full"
      ? await d
          .prepare(
            `SELECT r.id,r.page_id,r.version,r.snapshot_inline,r.snapshot_object_key,r.content_sha256,r.change_summary,r.actor_email,r.origin,r.save_kind,r.status,r.is_pinned,r.created_at FROM page_revisions r JOIN pages p ON p.id=r.page_id WHERE p.wiki_id=? AND r.status='ready' ORDER BY r.page_id,r.version`,
          )
          .bind(input.wikiId)
          .all<Record<string, unknown>>()
      : { results: [] as Record<string, unknown>[] };
  const audits =
    input.profile === "full"
      ? await d
          .prepare(
            `SELECT actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at FROM audit_events WHERE wiki_id=? ORDER BY created_at`,
          )
          .bind(input.wikiId)
          .all()
      : { results: [] };
  const members = input.includeMemberReference
    ? await d
        .prepare(
          `SELECT user_email,role,created_at FROM wiki_members WHERE wiki_id=? ORDER BY user_email`,
        )
        .bind(input.wikiId)
        .all()
    : { results: [] };
  const metadata = {
    schema_version: 1,
    exported_at: timestamp,
    profile: input.profile,
    wiki,
    operating_contract: operatingContract
      ? {
          version: operatingContract.version,
          contract: parseOperatingContract(
            JSON.parse(operatingContract.contract_json),
          ),
          updated_by: operatingContract.updated_by,
          updated_at: operatingContract.updated_at,
        }
      : null,
    pages: pages.results,
    links: links.results,
    claims: claims.results,
    knowledge_map: knowledgeMap
      ? {
          ...knowledgeMap,
          topics: knowledgeTopics.results,
          placements: knowledgePlacements.results,
        }
      : null,
    attachments: attachments.results.map(({ object_key, ...item }) => {
      void object_key;
      return item;
    }),
    revisions: revisions.results.map(
      ({ snapshot_inline, snapshot_object_key, ...item }) => {
        void snapshot_inline;
        void snapshot_object_key;
        return item;
      },
    ),
    audit_events: audits.results,
    members_reference: members.results,
  };
  const metadataJson = stableJson(metadata),
    metadataKey = `backups/${input.wikiId}/${runId}/part-0000.json`,
    metadataSaved = await putVerified(
      metadataKey,
      metadataJson,
      "application/json",
    );
  const parts: ExportPart[] = [
    {
      number: 0,
      kind: "metadata",
      filename: "metadata/wiki-export.json",
      size_bytes: metadataSaved.size_bytes,
      sha256: metadataSaved.hash,
      object_key: metadataKey,
    },
  ];
  for (const attachment of attachments.results) {
    parts.push({
      number: parts.length,
      kind: "attachment",
      filename: `attachments/${attachment.id}-${attachment.filename}`,
      size_bytes: attachment.size_bytes,
      sha256: attachment.sha256,
      object_key: attachment.object_key,
    });
  }
  if (input.profile === "full")
    for (const revision of revisions.results) {
      const revisionId = String(revision.id),
        contentHash = String(revision.content_sha256),
        inline =
          typeof revision.snapshot_inline === "string"
            ? revision.snapshot_inline
            : null,
        existingKey =
          typeof revision.snapshot_object_key === "string"
            ? revision.snapshot_object_key
            : null;
      let objectKey = existingKey;
      let objectSize = 0;
      if (inline !== null) {
        objectKey = `backups/${input.wikiId}/${runId}/revision-${revisionId}.md`;
        const saved = await putVerified(
          objectKey,
          inline,
          "text/markdown; charset=utf-8",
        );
        if (saved.hash !== contentHash)
          throw new AppError(
            "retryable_storage_error",
            "A revision changed while preparing the backup.",
            503,
            { revision_id: revisionId },
            true,
          );
        objectSize = saved.size_bytes;
      } else if (existingKey) {
        objectSize = (
          await readVerifiedRevisionObject(existingKey, contentHash, {
            revision_id: revisionId,
          })
        ).size_bytes;
      }
      if (!objectKey)
        throw new AppError(
          "retryable_storage_error",
          "A ready revision has no snapshot pointer.",
          503,
          { revision_id: revisionId },
          false,
        );
      parts.push({
        number: parts.length,
        kind: "revision",
        filename: `revisions/snapshots/${revision.page_id}-v${revision.version}.md`,
        size_bytes: objectSize,
        sha256: contentHash,
        object_key: objectKey,
        revision_id: revisionId,
      });
    }
  const hashBase = {
      schema_version: 1,
      backup_run_id: runId,
      exported_at: timestamp,
      wiki_id: input.wikiId,
      profile: input.profile,
      page_count: pages.results.length,
      attachment_count: attachments.results.length,
      revision_count: revisions.results.length,
      parts: parts.map(({ object_key, revision_id, ...part }) => {
        void object_key;
        void revision_id;
        return part;
      }),
    },
    manifestHash = await sha256(stableJson(hashBase)),
    manifest: StoredExportManifest = {
      ...hashBase,
      parts,
      manifest_hash: manifestHash,
    };
  await d.batch([
    d
      .prepare(
        `INSERT INTO backup_runs(id,wiki_id,profile,status,manifest_hash,part_count,created_at,completed_at) VALUES(?,?,?,'completed',?,?,?,?)`,
      )
      .bind(
        runId,
        input.wikiId,
        input.profile,
        manifestHash,
        parts.length,
        timestamp,
        timestamp,
      ),
    d
      .prepare(
        `INSERT INTO backup_manifests(backup_run_id,manifest_json,created_at) VALUES(?,?,?)`,
      )
      .bind(runId, JSON.stringify(manifest), timestamp),
    d
      .prepare(
        `INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) VALUES(?,?,?,'human','backup.prepare','backup',?,'success',?,?,?)`,
      )
      .bind(
        uuid(),
        input.wikiId,
        input.email,
        runId,
        input.requestId,
        JSON.stringify({
          profile: input.profile,
          part_count: parts.length,
          manifest_hash: manifestHash,
        }),
        timestamp,
      ),
  ]);
  return publicExportManifest(manifest);
}

async function storedExportManifest(wikiId: string, runId: string) {
  const row = await db()
    .prepare(
      `SELECT m.manifest_json FROM backup_manifests m JOIN backup_runs b ON b.id=m.backup_run_id WHERE m.backup_run_id=? AND b.wiki_id=? AND b.status='completed'`,
    )
    .bind(runId, wikiId)
    .first<{ manifest_json: string }>();
  if (!row)
    throw new AppError(
      "not_found",
      "The requested backup run was not found.",
      404,
      { backup_run_id: runId },
    );
  return JSON.parse(row.manifest_json) as StoredExportManifest;
}
export async function getExportPart(
  wikiId: string,
  runId: string,
  partNumber: number,
) {
  const manifest = await storedExportManifest(wikiId, runId),
    part = manifest.parts.find((item) => item.number === partNumber);
  if (!part)
    throw new AppError(
      "not_found",
      "The requested backup part was not found.",
      404,
      { backup_run_id: runId, part: partNumber },
    );
  const object = await env.FILES?.get(part.object_key);
  if (!object)
    throw new AppError(
      "retryable_storage_error",
      "The backup part object is missing.",
      503,
      { backup_run_id: runId, part: partNumber },
      false,
    );
  return { manifest, part, object };
}
export async function acknowledgeExport(input: {
  wikiId: string;
  email: string;
  runId: string;
  manifestHash: string;
  parts: Array<{ number: number; sha256: string }>;
  requestId: string;
}) {
  const manifest = await storedExportManifest(input.wikiId, input.runId);
  if (input.manifestHash !== manifest.manifest_hash)
    throw new AppError(
      "validation_error",
      "manifest_hash does not match the prepared backup.",
      409,
    );
  const expected = manifest.parts.map((part) => ({
      number: part.number,
      sha256: part.sha256,
    })),
    received = [...input.parts].sort((a, b) => a.number - b.number);
  if (stableJson(expected) !== stableJson(received))
    throw new AppError(
      "validation_error",
      "Every backup part number and checksum must be acknowledged exactly once.",
      409,
      {
        expected_part_count: expected.length,
        received_part_count: received.length,
      },
    );
  const revisionIds = manifest.parts.flatMap((part) =>
      part.revision_id ? [part.revision_id] : [],
    ),
    d = db(),
    timestamp = now();
  for (let index = 0; index < revisionIds.length; index += 50)
    await d.batch(
      revisionIds
        .slice(index, index + 50)
        .map((revisionId) =>
          d
            .prepare(
              `INSERT OR IGNORE INTO backup_revision_coverage(backup_run_id,revision_id) VALUES(?,?)`,
            )
            .bind(input.runId, revisionId),
        ),
    );
  await d.batch([
    d
      .prepare(
        `UPDATE backup_runs SET acknowledged_at=? WHERE id=? AND wiki_id=? AND manifest_hash=?`,
      )
      .bind(timestamp, input.runId, input.wikiId, input.manifestHash),
    d
      .prepare(
        `INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) VALUES(?,?,?,'human','backup.ack','backup',?,'success',?,?,?)`,
      )
      .bind(
        uuid(),
        input.wikiId,
        input.email,
        input.runId,
        input.requestId,
        JSON.stringify({ part_count: expected.length }),
        timestamp,
      ),
  ]);
  return {
    backup_run_id: input.runId,
    acknowledged_at: timestamp,
    revision_coverage_count: revisionIds.length,
  };
}

type ImportManifest = {
  schema_version: number;
  backup_run_id: string;
  exported_at: string;
  wiki_id: string;
  profile: "portable" | "full";
  page_count: number;
  attachment_count: number;
  revision_count: number;
  parts: Array<{
    number: number;
    kind: "metadata" | "attachment" | "revision";
    filename: string;
    size_bytes: number;
    sha256: string;
    url?: string;
  }>;
  manifest_hash: string;
};
function validateImportManifest(value: unknown): ImportManifest {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AppError("validation_error", "manifest must be an object.", 400);
  const manifest = value as ImportManifest;
  if (
    manifest.schema_version !== 1 ||
    !["portable", "full"].includes(manifest.profile) ||
    !Number.isInteger(manifest.page_count) ||
    manifest.page_count < 0 ||
    !Number.isInteger(manifest.attachment_count) ||
    manifest.attachment_count < 0 ||
    !Number.isInteger(manifest.revision_count) ||
    manifest.revision_count < 0 ||
    !Array.isArray(manifest.parts) ||
    manifest.parts.length < 1 ||
    manifest.parts.length > 1000
  )
    throw new AppError(
      "validation_error",
      "The import manifest schema is not supported.",
      400,
    );
  assertActiveAttachmentCapacity(0, manifest.attachment_count);
  const numbers = new Set<number>(),
    filenames = new Set<string>();
  let totalSize = 0;
  for (const part of manifest.parts) {
    if (
      !Number.isInteger(part.number) ||
      part.number < 0 ||
      numbers.has(part.number) ||
      !["metadata", "attachment", "revision"].includes(part.kind) ||
      typeof part.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(part.sha256) ||
      !Number.isInteger(part.size_bytes) ||
      part.size_bytes < 0 ||
      part.size_bytes > 512 * 1024 ||
      typeof part.filename !== "string" ||
      part.filename.length < 1 ||
      filenames.has(part.filename)
    )
      throw new AppError(
        "validation_error",
        "The import manifest contains an invalid part descriptor.",
        400,
        { part: part.number },
      );
    numbers.add(part.number);
    filenames.add(part.filename);
    totalSize += part.size_bytes;
    if (
      part.filename.includes("..") ||
      part.filename.startsWith("/") ||
      part.filename.includes("\\") ||
      part.filename.includes(":")
    )
      throw new AppError(
        "validation_error",
        "The import manifest contains an unsafe path.",
        400,
        { filename: part.filename },
      );
  }
  if (totalSize > 500 * 1024 * 1024)
    throw new AppError(
      "validation_error",
      "The import manifest exceeds the 500 MB package limit.",
      400,
      { total_size_bytes: totalSize },
    );
  if (
    !manifest.parts.some(
      (part) => part.number === 0 && part.kind === "metadata",
    )
  )
    throw new AppError(
      "validation_error",
      "The import manifest must contain metadata part 0.",
      400,
    );
  return manifest;
}
export async function createImportSession(input: {
  email: string;
  manifest: unknown;
  requestId: string;
}) {
  const manifest = validateImportManifest(input.manifest),
    hashBase = {
      schema_version: manifest.schema_version,
      backup_run_id: manifest.backup_run_id,
      exported_at: manifest.exported_at,
      wiki_id: manifest.wiki_id,
      profile: manifest.profile,
      page_count: manifest.page_count,
      attachment_count: manifest.attachment_count,
      revision_count: manifest.revision_count,
      parts: manifest.parts.map(({ url, ...part }) => {
        void url;
        return part;
      }),
    },
    computed = await sha256(stableJson(hashBase));
  if (computed !== manifest.manifest_hash)
    throw new AppError(
      "validation_error",
      "The import manifest hash is invalid.",
      400,
      { expected: manifest.manifest_hash, computed },
    );
  const sessionId = uuid(),
    stagingWikiId = uuid(),
    timestamp = now(),
    expires = new Date(Date.now() + 24 * 86_400_000).toISOString();
  await db().batch([
    db()
      .prepare(
        `INSERT INTO import_sessions(id,actor_email,manifest_hash,status,staging_wiki_id,total_batches,created_at,expires_at) VALUES(?,?,?,'uploading',?,?,?,?)`,
      )
      .bind(
        sessionId,
        input.email,
        manifest.manifest_hash,
        stagingWikiId,
        manifest.parts.length,
        timestamp,
        expires,
      ),
    db()
      .prepare(
        `INSERT INTO import_manifests(session_id,manifest_json,created_at) VALUES(?,?,?)`,
      )
      .bind(sessionId, JSON.stringify(manifest), timestamp),
  ]);
  return {
    session_id: sessionId,
    status: "uploading",
    total_batches: manifest.parts.length,
    expires_at: expires,
    preview: {
      profile: manifest.profile,
      page_count: manifest.page_count,
      attachment_count: manifest.attachment_count,
      revision_count: manifest.revision_count,
      changes_active_wiki: false,
    },
  };
}
async function importSession(email: string, sessionId: string) {
  const row = await db()
    .prepare(
      `SELECT s.id,s.actor_email,s.manifest_hash,s.status,s.staging_wiki_id,s.completed_batches,s.total_batches,s.expires_at,m.manifest_json FROM import_sessions s JOIN import_manifests m ON m.session_id=s.id WHERE s.id=? AND s.actor_email=?`,
    )
    .bind(sessionId, email)
    .first<{
      id: string;
      actor_email: string;
      manifest_hash: string;
      status: string;
      staging_wiki_id: string;
      completed_batches: number;
      total_batches: number;
      expires_at: string;
      manifest_json: string;
    }>();
  if (!row)
    throw new AppError("not_found", "The import session was not found.", 404, {
      session_id: sessionId,
    });
  if (new Date(row.expires_at).getTime() < Date.now())
    throw new AppError(
      "validation_error",
      "The import session has expired.",
      410,
      { session_id: sessionId },
    );
  return { ...row, manifest: JSON.parse(row.manifest_json) as ImportManifest };
}
export async function uploadImportPart(input: {
  email: string;
  sessionId: string;
  partNumber: number;
  data: ArrayBuffer;
}) {
  if (!env.FILES)
    throw new AppError(
      "retryable_storage_error",
      "Import storage is unavailable.",
      503,
      {},
      true,
    );
  const session = await importSession(input.email, input.sessionId);
  if (!["uploading", "validated"].includes(session.status))
    throw new AppError(
      "validation_error",
      "This import session does not accept more parts.",
      409,
      { status: session.status },
    );
  const part = session.manifest.parts.find(
    (item) => item.number === input.partNumber,
  );
  if (!part)
    throw new AppError(
      "validation_error",
      "The part number is not declared by the manifest.",
      400,
      { part: input.partNumber },
    );
  if (input.data.byteLength !== part.size_bytes)
    throw new AppError(
      "validation_error",
      "The import part size does not match the manifest.",
      400,
      {
        part: input.partNumber,
        expected_size: part.size_bytes,
        received_size: input.data.byteLength,
      },
    );
  const hash = await sha256Bytes(input.data);
  if (hash !== part.sha256)
    throw new AppError(
      "validation_error",
      "The import part checksum does not match the manifest.",
      400,
      {
        part: input.partNumber,
        expected_sha256: part.sha256,
        received_sha256: hash,
      },
    );
  const key = `imports/${input.sessionId}/part-${String(input.partNumber).padStart(4, "0")}`,
    existing = await db()
      .prepare(
        `SELECT status,received_hash FROM import_batches WHERE session_id=? AND batch_index=?`,
      )
      .bind(input.sessionId, input.partNumber)
      .first<{ status: string; received_hash: string }>();
  if (existing?.status === "completed") {
    if (existing.received_hash !== hash)
      throw new AppError(
        "validation_error",
        "This import part was already uploaded with different content.",
        409,
        { part: input.partNumber },
      );
    return {
      session_id: input.sessionId,
      part: input.partNumber,
      status: "completed",
      completed_batches: session.completed_batches,
      total_batches: session.total_batches,
    };
  }
  await env.FILES.put(key, input.data, {
    httpMetadata: {
      contentType:
        part.kind === "metadata"
          ? "application/json"
          : "application/octet-stream",
    },
    customMetadata: { sha256: hash },
  });
  const saved = await env.FILES.get(key);
  if (!saved || (await sha256Bytes(await saved.arrayBuffer())) !== hash) {
    await env.FILES.delete(key);
    throw new AppError(
      "retryable_storage_error",
      "The import part could not be verified after upload.",
      503,
      { part: input.partNumber },
      true,
    );
  }
  const inserted = await db()
    .prepare(
      `INSERT OR IGNORE INTO import_batches(session_id,batch_index,expected_hash,received_hash,status,item_count,size_bytes,completed_at) VALUES(?,?,?,?, 'completed',1,?,?)`,
    )
    .bind(
      input.sessionId,
      input.partNumber,
      part.sha256,
      hash,
      input.data.byteLength,
      now(),
    )
    .run();
  if ((inserted.meta.changes ?? 0) === 1)
    await db()
      .prepare(
        `UPDATE import_sessions SET completed_batches=completed_batches+1,status=CASE WHEN completed_batches+1>=total_batches THEN 'validated' ELSE 'uploading' END WHERE id=?`,
      )
      .bind(input.sessionId)
      .run();
  const latest = await importSession(input.email, input.sessionId);
  return {
    session_id: input.sessionId,
    part: input.partNumber,
    status: latest.status,
    completed_batches: latest.completed_batches,
    total_batches: latest.total_batches,
  };
}

async function readImportPart(sessionId: string, partNumber: number) {
  const object = await env.FILES?.get(
    `imports/${sessionId}/part-${String(partNumber).padStart(4, "0")}`,
  );
  if (!object)
    throw new AppError(
      "retryable_storage_error",
      "A validated import part is missing.",
      503,
      { part: partNumber },
      false,
    );
  return object.arrayBuffer();
}
function importedString(value: unknown, field: string, max = 262_144) {
  if (typeof value !== "string" || value.length < 1 || value.length > max)
    throw new AppError(
      "validation_error",
      `Imported ${field} is invalid.`,
      400,
      { field },
    );
  return value;
}
function importedUuid(value: unknown, field: string) {
  const result = importedString(value, field, 36);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      result,
    )
  )
    throw new AppError(
      "validation_error",
      `Imported ${field} must be a UUID.`,
      400,
      { field },
    );
  return result;
}
function importedInteger(value: unknown, field: string, min = 0) {
  if (!Number.isInteger(value) || Number(value) < min)
    throw new AppError(
      "validation_error",
      `Imported ${field} is invalid.`,
      400,
      { field },
    );
  return Number(value);
}
function importedOptionalString(value: unknown, field: string, max: number) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length < 1 || value.length > max)
    throw new AppError(
      "validation_error",
      `Imported ${field} is invalid.`,
      400,
      { field },
    );
  return value;
}
function importedOptionalConfidence(value: unknown, field: string) {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  )
    throw new AppError(
      "validation_error",
      `Imported ${field} is invalid.`,
      400,
      { field },
    );
  return value;
}

function validateImportedKnowledgeMap(input: {
  rawMap: Record<string, unknown> | null;
  rawTopics: Record<string, unknown>[];
  rawPlacements: Record<string, unknown>[];
  pageIds: Set<string>;
  claimIds: Set<string>;
  pageTypeById: Map<string, PageType>;
  fallbackActor: string;
}) {
  if (!input.rawMap) return null;
  const presentations = new Set<string>(KNOWLEDGE_PRESENTATIONS),
    roles = new Set<string>(KNOWLEDGE_PLACEMENT_ROLES),
    topicIds = new Set<string>(),
    placementIds = new Set<string>();
  function importedBrief(value: unknown, field: string) {
    if (value === null || value === undefined || value === "") return null;
    let raw = value;
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw);
      } catch {
        throw new AppError(
          "validation_error",
          `Imported ${field} is not valid JSON.`,
          400,
          { field },
        );
      }
    }
    const brief = parseKnowledgeMapPatch({
      expected_version: 0,
      overview_brief: raw,
    }).overview_brief!;
    for (const item of [
      ...brief.takeaways,
      ...brief.tensions,
      ...brief.implications,
      ...brief.questions,
    ])
      for (const reference of item.evidence) {
        if ("claim_id" in reference) {
          if (!input.claimIds.has(reference.claim_id))
            throw new AppError(
              "validation_error",
              `Imported ${field} references a missing claim.`,
              400,
              { field, claim_id: reference.claim_id },
            );
        } else if (!reference.page_id || !input.pageIds.has(reference.page_id))
          throw new AppError(
            "validation_error",
            `Imported ${field} references a missing page.`,
            400,
            { field },
          );
      }
    return stableJson(brief);
  }
  const topics = input.rawTopics.map((topic) => {
    const id = importedUuid(topic.id, "knowledge_topic.id"),
      parentId =
        topic.parent_topic_id === null || topic.parent_topic_id === undefined
          ? null
          : importedUuid(
              topic.parent_topic_id,
              "knowledge_topic.parent_topic_id",
            ),
      presentation = importedString(
        topic.presentation,
        "knowledge_topic.presentation",
        30,
      );
    if (topicIds.has(id) || !presentations.has(presentation))
      throw new AppError(
        "validation_error",
        "Imported Knowledge Atlas topics contain a duplicate ID or unsupported presentation.",
        400,
        { topic_id: id },
      );
    topicIds.add(id);
    return {
      id,
      parentId,
      title: importedString(topic.title, "knowledge_topic.title", 120),
      summary: importedString(topic.summary, "knowledge_topic.summary", 280),
      presentation,
      sortOrder: importedInteger(
        topic.sort_order ?? 0,
        "knowledge_topic.sort_order",
      ),
      isLocked: Number(topic.is_locked) === 1,
      insightBriefJson: importedBrief(
        topic.insight_brief_json,
        "knowledge_topic.insight_brief_json",
      ),
      insightBriefBasisHash:
        typeof topic.insight_brief_basis_hash === "string"
          ? importedString(
              topic.insight_brief_basis_hash,
              "knowledge_topic.insight_brief_basis_hash",
              64,
            )
          : null,
      createdBy:
        typeof topic.created_by === "string"
          ? importedString(topic.created_by, "knowledge_topic.created_by", 320)
          : input.fallbackActor,
      updatedBy:
        typeof topic.updated_by === "string"
          ? importedString(topic.updated_by, "knowledge_topic.updated_by", 320)
          : input.fallbackActor,
      createdAt:
        typeof topic.created_at === "string" ? topic.created_at : now(),
      updatedAt:
        typeof topic.updated_at === "string" ? topic.updated_at : now(),
    };
  });
  for (const topic of topics) {
    if (topic.parentId && !topicIds.has(topic.parentId))
      throw new AppError(
        "validation_error",
        "An imported Knowledge Atlas topic references a missing parent.",
        400,
        { topic_id: topic.id, parent_topic_id: topic.parentId },
      );
    const seen = new Set([topic.id]);
    let parentId = topic.parentId;
    for (let depth = 1; parentId; depth++) {
      if (seen.has(parentId) || depth >= 4)
        throw new AppError(
          "validation_error",
          "The imported Knowledge Atlas contains a cycle or exceeds four levels.",
          400,
          { topic_id: topic.id },
        );
      seen.add(parentId);
      parentId =
        topics.find((candidate) => candidate.id === parentId)?.parentId ?? null;
    }
  }
  const placements = input.rawPlacements.map((placement) => {
    const id = importedUuid(placement.id, "knowledge_placement.id"),
      topicId = importedUuid(
        placement.topic_id,
        "knowledge_placement.topic_id",
      ),
      pageId = importedUuid(placement.page_id, "knowledge_placement.page_id"),
      role = importedString(placement.role, "knowledge_placement.role", 30);
    if (
      placementIds.has(id) ||
      !topicIds.has(topicId) ||
      !input.pageIds.has(pageId) ||
      !roles.has(role)
    )
      throw new AppError(
        "validation_error",
        "An imported Knowledge Atlas placement has a duplicate or invalid reference.",
        400,
        { placement_id: id },
      );
    placementIds.add(id);
    return {
      id,
      topicId,
      pageId,
      role,
      summary: importedString(
        placement.summary,
        "knowledge_placement.summary",
        280,
      ),
      sortOrder: importedInteger(
        placement.sort_order ?? 0,
        "knowledge_placement.sort_order",
      ),
      isLocked: Number(placement.is_locked) === 1,
      createdBy:
        typeof placement.created_by === "string"
          ? importedString(
              placement.created_by,
              "knowledge_placement.created_by",
              320,
            )
          : input.fallbackActor,
      updatedBy:
        typeof placement.updated_by === "string"
          ? importedString(
              placement.updated_by,
              "knowledge_placement.updated_by",
              320,
            )
          : input.fallbackActor,
      createdAt:
        typeof placement.created_at === "string" ? placement.created_at : now(),
      updatedAt:
        typeof placement.updated_at === "string" ? placement.updated_at : now(),
    };
  });
  const topicPagePairs = new Set<string>();
  for (const placement of placements) {
    const pair = `${placement.topicId}:${placement.pageId}`;
    if (topicPagePairs.has(pair))
      throw new AppError(
        "validation_error",
        "An imported page cannot appear twice in the same Knowledge Atlas topic.",
        400,
        { page_id: placement.pageId, topic_id: placement.topicId },
      );
    topicPagePairs.add(pair);
  }
  for (const pageId of new Set(placements.map((item) => item.pageId))) {
    const pagePlacements = placements.filter((item) => item.pageId === pageId),
      primaryCount = pagePlacements.filter(
        (item) => item.role === "primary",
      ).length;
    if (
      pagePlacements.length > 3 ||
      primaryCount > 1 ||
      (input.pageTypeById.get(pageId) !== "source" && primaryCount !== 1)
    )
      throw new AppError(
        "validation_error",
        "An imported page violates Knowledge Atlas placement limits.",
        400,
        { page_id: pageId },
      );
  }
  return {
    version: importedInteger(
      input.rawMap.version ?? 0,
      "knowledge_map.version",
    ),
    updatedBy:
      typeof input.rawMap.updated_by === "string"
        ? importedString(
            input.rawMap.updated_by,
            "knowledge_map.updated_by",
            320,
          )
        : input.fallbackActor,
    updatedAt:
      typeof input.rawMap.updated_at === "string"
        ? input.rawMap.updated_at
        : now(),
    overviewBriefJson: importedBrief(
      input.rawMap.overview_brief_json,
      "knowledge_map.overview_brief_json",
    ),
    overviewBriefBasisHash:
      typeof input.rawMap.overview_brief_basis_hash === "string"
        ? importedString(
            input.rawMap.overview_brief_basis_hash,
            "knowledge_map.overview_brief_basis_hash",
            64,
          )
        : null,
    topics,
    placements,
  };
}

export async function commitImport(input: {
  email: string;
  sessionId: string;
  requestId: string;
}) {
  if (!env.FILES)
    throw new AppError(
      "retryable_storage_error",
      "Import storage is unavailable.",
      503,
      {},
      true,
    );
  const session = await importSession(input.email, input.sessionId);
  if (session.status === "committed") {
    const wiki = await db()
      .prepare(
        `SELECT w.title,(SELECT COUNT(*) FROM knowledge_claims c WHERE c.wiki_id=w.id AND c.deleted_at IS NULL) AS claim_count FROM wikis w WHERE w.id=? AND w.status='active'`,
      )
      .bind(session.staging_wiki_id)
      .first<{ title: string; claim_count: number }>();
    return {
      wiki_id: session.staging_wiki_id,
      title: wiki?.title ?? "Imported Wiki",
      page_count: session.manifest.page_count,
      link_count: 0,
      claim_count: Number(wiki?.claim_count ?? 0),
      attachment_count: session.manifest.attachment_count,
      revision_count: session.manifest.revision_count,
      status: "committed",
    };
  }
  if (
    !["validated", "committing"].includes(session.status) ||
    session.completed_batches !== session.total_batches
  )
    throw new AppError(
      "validation_error",
      "Every declared import part must be validated before commit.",
      409,
      {
        status: session.status,
        completed_batches: session.completed_batches,
        total_batches: session.total_batches,
      },
    );
  const state = await db()
    .prepare(
      `SELECT bootstrap_status,reserved_by,version FROM site_state WHERE id=1`,
    )
    .first<{
      bootstrap_status: string;
      reserved_by: string | null;
      version: number;
    }>();
  const ownsReservation =
    state?.bootstrap_status === "reserved" &&
    state.reserved_by === input.email &&
    session.status === "committing";
  if (state?.bootstrap_status !== "empty" && !ownsReservation)
    throw new AppError(
      "validation_error",
      "Import commit is allowed only when this Site has no active wiki.",
      409,
      { bootstrap_status: state?.bootstrap_status ?? "unknown" },
    );
  const metadataBuffer = await readImportPart(input.sessionId, 0);
  let metadata: Record<string, unknown>;
  try {
    metadata = JSON.parse(new TextDecoder().decode(metadataBuffer)) as Record<
      string,
      unknown
    >;
  } catch {
    throw new AppError(
      "validation_error",
      "The import metadata part is not valid JSON.",
      400,
    );
  }
  const rawPages = Array.isArray(metadata.pages)
      ? (metadata.pages as Record<string, unknown>[])
      : [],
    rawLinks = Array.isArray(metadata.links)
      ? (metadata.links as Record<string, unknown>[])
      : [],
    rawClaims = Array.isArray(metadata.claims)
      ? (metadata.claims as Record<string, unknown>[])
      : [],
    rawKnowledgeMap =
      metadata.knowledge_map &&
      typeof metadata.knowledge_map === "object" &&
      !Array.isArray(metadata.knowledge_map)
        ? (metadata.knowledge_map as Record<string, unknown>)
        : null,
    rawKnowledgeTopics = Array.isArray(rawKnowledgeMap?.topics)
      ? (rawKnowledgeMap.topics as Record<string, unknown>[])
      : [],
    rawKnowledgePlacements = Array.isArray(rawKnowledgeMap?.placements)
      ? (rawKnowledgeMap.placements as Record<string, unknown>[])
      : [],
    rawOperatingContract =
      metadata.operating_contract &&
      typeof metadata.operating_contract === "object" &&
      !Array.isArray(metadata.operating_contract)
        ? (metadata.operating_contract as Record<string, unknown>)
        : null,
    rawAttachments = Array.isArray(metadata.attachments)
      ? (metadata.attachments as Record<string, unknown>[])
      : [],
    rawRevisions = Array.isArray(metadata.revisions)
      ? (metadata.revisions as Record<string, unknown>[])
      : [];
  if (
    rawPages.length !== session.manifest.page_count ||
    rawAttachments.length !== session.manifest.attachment_count ||
    rawRevisions.length !== session.manifest.revision_count ||
    rawPages.length > 200 ||
    rawAttachments.length > 200 ||
    rawLinks.length > 2000 ||
    rawClaims.length > 2000 ||
    rawKnowledgeTopics.length > 50 ||
    rawKnowledgePlacements.length > 600 ||
    rawRevisions.length > 1000
  )
    throw new AppError(
      "validation_error",
      "Import counts do not match the manifest or exceed the MVP safety limit.",
      400,
      {
        pages: rawPages.length,
        attachments: rawAttachments.length,
        links: rawLinks.length,
        claims: rawClaims.length,
        knowledge_topics: rawKnowledgeTopics.length,
        knowledge_placements: rawKnowledgePlacements.length,
        revisions: rawRevisions.length,
      },
    );
  const allowedTypes = new Set<PageType>([
      "folder",
      "note",
      "source",
      "concept",
      "entity",
      "synthesis",
      "comparison",
      "query",
    ]),
    pageIds = new Set(rawPages.map((page) => importedUuid(page.id, "page.id")));
  if (pageIds.size !== rawPages.length)
    throw new AppError(
      "validation_error",
      "Imported page IDs must be unique.",
      400,
    );
  const attachmentIds = new Set(
      rawAttachments.map((attachment) =>
        importedUuid(attachment.id, "attachment.id"),
      ),
    ),
    revisionIds = new Set(
      rawRevisions.map((revision) => importedUuid(revision.id, "revision.id")),
    ),
    revisionVersions = new Set(
      rawRevisions.map(
        (revision) =>
          `${importedUuid(revision.page_id, "revision.page_id")}:${importedInteger(revision.version, "revision.version", 1)}`,
      ),
    ),
    claimIds = new Set(
      rawClaims.map((claim) => importedUuid(claim.id, "claim.id")),
    );
  if (
    attachmentIds.size !== rawAttachments.length ||
    revisionIds.size !== rawRevisions.length ||
    revisionVersions.size !== rawRevisions.length ||
    claimIds.size !== rawClaims.length
  )
    throw new AppError(
      "validation_error",
      "Imported attachment, revision, and claim identities must be unique.",
      400,
    );
  const pages = rawPages.map((page) => {
    const id = importedUuid(page.id, "page.id"),
      parentId =
        page.parent_id === null
          ? null
          : importedUuid(page.parent_id, "page.parent_id"),
      title = importedString(page.title, "page.title", 200),
      slug = importedString(page.slug, "page.slug", 120),
      pageType = importedString(
        page.page_type,
        "page.page_type",
        30,
      ) as PageType,
      markdown = importedString(page.markdown, "page.markdown", 262_144),
      version = importedInteger(page.version, "page.version", 1),
      sourceUrl = importedOptionalString(
        page.source_url,
        "page.source_url",
        2048,
      ),
      retrievalStatus = importedOptionalString(
        page.retrieval_status,
        "page.retrieval_status",
        30,
      ) as RetrievalStatus | null,
      retrievedAt = importedOptionalString(
        page.retrieved_at,
        "page.retrieved_at",
        40,
      ),
      extractionMethod = importedOptionalString(
        page.extraction_method,
        "page.extraction_method",
        120,
      ),
      confidence = importedOptionalConfidence(
        page.confidence,
        "page.confidence",
      );
    if (parentId && !pageIds.has(parentId))
      throw new AppError(
        "validation_error",
        "An imported page references a missing parent.",
        400,
        { page_id: id, parent_id: parentId },
      );
    if (!allowedTypes.has(pageType) || slugify(slug) !== slug)
      throw new AppError(
        "validation_error",
        "An imported page type or slug is invalid.",
        400,
        { page_id: id },
      );
    if (
      (sourceUrl !== null ||
        retrievalStatus !== null ||
        retrievedAt !== null ||
        extractionMethod !== null ||
        confidence !== null) &&
      pageType !== "source"
    )
      throw new AppError(
        "validation_error",
        "Structured source metadata is allowed only on source pages.",
        400,
        { page_id: id },
      );
    if (
      retrievalStatus !== null &&
      !new Set<RetrievalStatus>([
        "success",
        "partial",
        "failed",
        "unavailable",
      ]).has(retrievalStatus)
    )
      throw new AppError(
        "validation_error",
        "Imported page.retrieval_status is invalid.",
        400,
        { page_id: id },
      );
    return {
      id,
      parentId,
      title,
      slug,
      pageType,
      markdown,
      sourceUrl,
      retrievalStatus,
      retrievedAt,
      extractionMethod,
      confidence,
      version,
      sortOrder: importedInteger(page.sort_order ?? 0, "page.sort_order"),
      frontmatter: JSON.stringify(parseFrontmatter(markdown)),
      createdAt: typeof page.created_at === "string" ? page.created_at : now(),
      updatedAt: typeof page.updated_at === "string" ? page.updated_at : now(),
    };
  });
  const siblingSlugs = new Set<string>();
  for (const page of pages) {
    const siblingSlug = `${page.parentId ?? ROOT_PARENT}:${page.slug}`;
    if (siblingSlugs.has(siblingSlug))
      throw new AppError(
        "validation_error",
        "Imported sibling page slugs must be unique.",
        400,
        { parent_id: page.parentId, slug: page.slug },
      );
    siblingSlugs.add(siblingSlug);
  }
  for (const page of pages) {
    const seen = new Set<string>([page.id]);
    let parentId = page.parentId;
    for (let depth = 0; parentId; depth++) {
      if (seen.has(parentId) || depth > 64)
        throw new AppError(
          "validation_error",
          "The imported page tree contains a cycle or exceeds 64 levels.",
          400,
          { page_id: page.id },
        );
      seen.add(parentId);
      parentId =
        pages.find((candidate) => candidate.id === parentId)?.parentId ?? null;
    }
  }
  const pageTypeById = new Map(pages.map((page) => [page.id, page.pageType])),
    importedClaimIds = new Set(
      rawClaims.map((claim) => importedUuid(claim.id, "claim.id")),
    ),
    knowledgeMapData = validateImportedKnowledgeMap({
      rawMap: rawKnowledgeMap,
      rawTopics: rawKnowledgeTopics,
      rawPlacements: rawKnowledgePlacements,
      pageIds,
      claimIds: importedClaimIds,
      pageTypeById,
      fallbackActor: input.email,
    }),
    operatingContract = rawOperatingContract
      ? {
          version: importedInteger(
            rawOperatingContract.version,
            "operating_contract.version",
            1,
          ),
          contract: parseOperatingContract(rawOperatingContract.contract),
          updatedBy:
            typeof rawOperatingContract.updated_by === "string"
              ? importedString(
                  rawOperatingContract.updated_by,
                  "operating_contract.updated_by",
                  320,
                )
              : input.email,
          updatedAt:
            typeof rawOperatingContract.updated_at === "string"
              ? importedString(
                  rawOperatingContract.updated_at,
                  "operating_contract.updated_at",
                  64,
                )
              : now(),
        }
      : null,
    claimRows = rawClaims.map((claim) => {
      const id = importedUuid(claim.id, "claim.id"),
        subjectPageId = importedUuid(
          claim.subject_page_id,
          "claim.subject_page_id",
        ),
        sourcePageId = importedUuid(
          claim.source_page_id,
          "claim.source_page_id",
        ),
        objectPageId =
          claim.object_page_id === null || claim.object_page_id === undefined
            ? null
            : importedUuid(claim.object_page_id, "claim.object_page_id"),
        objectValue = importedOptionalString(
          claim.object_value,
          "claim.object_value",
          200,
        ),
        confidence = importedOptionalConfidence(
          claim.confidence,
          "claim.confidence",
        ),
        validFrom = importedOptionalString(
          claim.valid_from,
          "claim.valid_from",
          64,
        ),
        validTo = importedOptionalString(claim.valid_to, "claim.valid_to", 64),
        supersedesClaimId =
          claim.supersedes_claim_id === null ||
          claim.supersedes_claim_id === undefined
            ? null
            : importedUuid(
                claim.supersedes_claim_id,
                "claim.supersedes_claim_id",
              );
      if (
        !pageIds.has(subjectPageId) ||
        !pageIds.has(sourcePageId) ||
        (objectPageId && !pageIds.has(objectPageId)) ||
        pageTypeById.get(sourcePageId) !== "source"
      )
        throw new AppError(
          "validation_error",
          "An imported claim references a missing page or non-source evidence page.",
          400,
          { claim_id: id },
        );
      if ((objectPageId === null) === (objectValue === null))
        throw new AppError(
          "validation_error",
          "An imported claim must contain exactly one object representation.",
          400,
          { claim_id: id },
        );
      if (confidence === null)
        throw new AppError(
          "validation_error",
          "An imported claim confidence is required.",
          400,
          { claim_id: id },
        );
      if (supersedesClaimId && !claimIds.has(supersedesClaimId))
        throw new AppError(
          "validation_error",
          "An imported claim supersedes a missing claim.",
          400,
          { claim_id: id },
        );
      if (validFrom && validTo && validTo < validFrom)
        throw new AppError(
          "validation_error",
          "An imported claim validity interval is inverted.",
          400,
          { claim_id: id },
        );
      return {
        id,
        subjectPageId,
        predicate: importedString(claim.predicate, "claim.predicate", 120),
        objectPageId,
        objectValue,
        sourcePageId,
        evidenceFragment: importedString(
          claim.evidence_fragment,
          "claim.evidence_fragment",
          2000,
        ),
        confidence,
        observedAt: importedString(claim.observed_at, "claim.observed_at", 64),
        validFrom,
        validTo,
        supersedesClaimId,
        createdBy:
          typeof claim.created_by === "string"
            ? importedString(claim.created_by, "claim.created_by", 320)
            : input.email,
        createdAt:
          typeof claim.created_at === "string" ? claim.created_at : now(),
        updatedAt:
          typeof claim.updated_at === "string" ? claim.updated_at : now(),
      };
    }),
    timestamp = now(),
    d = db(),
    leaseExpiresAt = new Date(Date.now() + 300_000).toISOString();
  if (!ownsReservation) {
    const reserved = await d
      .prepare(
        `UPDATE site_state SET bootstrap_status='reserved',reserved_by=?,reserved_at=?,lease_expires_at=?,version=version+1,updated_at=? WHERE id=1 AND bootstrap_status='empty' AND version=?`,
      )
      .bind(input.email, timestamp, leaseExpiresAt, timestamp, state.version)
      .run();
    if ((reserved.meta.changes ?? 0) !== 1)
      throw new AppError(
        "validation_error",
        "Another bootstrap or import reserved this Site first.",
        409,
      );
    await d
      .prepare(
        `UPDATE import_sessions SET status='committing',error_summary=NULL WHERE id=? AND actor_email=? AND status='validated'`,
      )
      .bind(input.sessionId, input.email)
      .run();
  } else
    await d
      .prepare(
        `UPDATE site_state SET lease_expires_at=?,updated_at=? WHERE id=1 AND bootstrap_status='reserved' AND reserved_by=?`,
      )
      .bind(leaseExpiresAt, timestamp, input.email)
      .run();

  const objectParts = session.manifest.parts.filter(
      (part) => part.kind === "attachment" || part.kind === "revision",
    ),
    batchStates = await d
      .prepare(
        `SELECT batch_index,status FROM import_batches WHERE session_id=?`,
      )
      .bind(input.sessionId)
      .all<{ batch_index: number; status: string }>(),
    statusByPart = new Map(
      batchStates.results.map((row) => [row.batch_index, row.status]),
    ),
    pendingObjectParts = objectParts.filter(
      (part) => statusByPart.get(part.number) !== "applied",
    ),
    commitBatch = pendingObjectParts.slice(0, 8);
  for (const part of commitBatch) {
    const data = await readImportPart(input.sessionId, part.number),
      hash = await sha256Bytes(data);
    if (data.byteLength !== part.size_bytes || hash !== part.sha256)
      throw new AppError(
        "validation_error",
        "An imported object failed checksum or size validation during commit.",
        400,
        { part: part.number },
      );
    let finalKey: string, contentType: string;
    if (part.kind === "attachment") {
      const attachment = rawAttachments.find((item) =>
          part.filename.startsWith(
            `attachments/${importedUuid(item.id, "attachment.id")}-`,
          ),
        ),
        attachmentId = attachment
          ? importedUuid(attachment.id, "attachment.id")
          : "";
      if (!attachment)
        throw new AppError(
          "validation_error",
          "An attachment part does not match import metadata.",
          400,
          { part: part.number },
        );
      finalKey = `attachments/${session.staging_wiki_id}/${attachmentId}`;
      contentType = importedString(
        attachment.mime_type,
        "attachment.mime_type",
        200,
      );
    } else {
      const revision = rawRevisions.find(
        (item) =>
          part.filename ===
          `revisions/snapshots/${importedUuid(item.page_id, "revision.page_id")}-v${importedInteger(item.version, "revision.version", 1)}.md`,
      );
      if (!revision)
        throw new AppError(
          "validation_error",
          "A revision part does not match import metadata.",
          400,
          { part: part.number },
        );
      finalKey = `revisions/${session.staging_wiki_id}/${importedUuid(revision.page_id, "revision.page_id")}/${importedInteger(revision.version, "revision.version", 1)}-import-${input.sessionId}.md`;
      contentType = "text/markdown; charset=utf-8";
    }
    await env.FILES.put(finalKey, data, {
      httpMetadata: { contentType },
      customMetadata: { sha256: hash },
    });
    await d
      .prepare(
        `UPDATE import_batches SET status='applied' WHERE session_id=? AND batch_index=? AND status='completed'`,
      )
      .bind(input.sessionId, part.number)
      .run();
    statusByPart.set(part.number, "applied");
    try {
      await env.FILES.delete(
        `imports/${input.sessionId}/part-${String(part.number).padStart(4, "0")}`,
      );
    } catch {}
  }
  if (pendingObjectParts.length > commitBatch.length)
    return {
      wiki_id: session.staging_wiki_id,
      title: "Imported Wiki",
      page_count: pages.length,
      link_count: rawLinks.length,
      claim_count: rawClaims.length,
      attachment_count: rawAttachments.length,
      revision_count: rawRevisions.length || pages.length,
      status: "committing",
      phase: "objects",
      processed_parts: commitBatch.length,
      remaining_parts: pendingObjectParts.length - commitBatch.length,
    };
  const attachmentRows: Array<{
      id: string;
      pageId: string | null;
      key: string;
      filename: string;
      mime: string;
      size: number;
      hash: string;
      createdAt: string;
    }> = [],
    revisionRows: Array<{
      id: string;
      pageId: string;
      version: number;
      inline: string | null;
      key: string | null;
      hash: string;
      summary: string | null;
      actor: string;
      origin: string;
      saveKind: string;
      createdAt: string;
    }> = [];
  try {
    for (const attachment of rawAttachments) {
      const id = importedUuid(attachment.id, "attachment.id"),
        part = session.manifest.parts.find(
          (item) =>
            item.kind === "attachment" &&
            item.filename.startsWith(`attachments/${id}-`),
        );
      if (!part)
        throw new AppError(
          "validation_error",
          "An attachment part is missing from the manifest.",
          400,
          { attachment_id: id },
        );
      const hash = importedString(attachment.sha256, "attachment.sha256", 64),
        size = importedInteger(
          attachment.size_bytes,
          "attachment.size_bytes",
          1,
        );
      if (
        hash !== part.sha256 ||
        size !== part.size_bytes ||
        statusByPart.get(part.number) !== "applied"
      )
        throw new AppError(
          "validation_error",
          "An imported attachment was not fully staged.",
          400,
          { attachment_id: id },
        );
      const key = `attachments/${session.staging_wiki_id}/${id}`;
      const pageId =
        attachment.page_id === null
          ? null
          : importedUuid(attachment.page_id, "attachment.page_id");
      if (pageId && !pageIds.has(pageId))
        throw new AppError(
          "validation_error",
          "An imported attachment references a missing page.",
          400,
          { attachment_id: id, page_id: pageId },
        );
      attachmentRows.push({
        id,
        pageId,
        key,
        filename: importedString(
          attachment.filename,
          "attachment.filename",
          200,
        ),
        mime: importedString(attachment.mime_type, "attachment.mime_type", 200),
        size,
        hash,
        createdAt:
          typeof attachment.created_at === "string"
            ? attachment.created_at
            : timestamp,
      });
    }
    if (rawRevisions.length) {
      for (const revision of rawRevisions) {
        const pageId = importedUuid(revision.page_id, "revision.page_id"),
          version = importedInteger(revision.version, "revision.version", 1),
          part = session.manifest.parts.find(
            (item) =>
              item.kind === "revision" &&
              item.filename === `revisions/snapshots/${pageId}-v${version}.md`,
          );
        if (!part)
          throw new AppError(
            "validation_error",
            "A revision snapshot part is missing.",
            400,
            { page_id: pageId, version },
          );
        const expected = importedString(
          revision.content_sha256,
          "revision.content_sha256",
          64,
        );
        if (
          part.sha256 !== expected ||
          statusByPart.get(part.number) !== "applied"
        )
          throw new AppError(
            "validation_error",
            "An imported revision was not fully staged.",
            400,
            { page_id: pageId, version },
          );
        if (!pageIds.has(pageId))
          throw new AppError(
            "validation_error",
            "An imported revision references a missing page.",
            400,
            { page_id: pageId, version },
          );
        const key = `revisions/${session.staging_wiki_id}/${pageId}/${version}-import-${input.sessionId}.md`;
        revisionRows.push({
          id: importedUuid(revision.id, "revision.id"),
          pageId,
          version,
          inline: null,
          key,
          hash: expected,
          summary:
            typeof revision.change_summary === "string"
              ? revision.change_summary
              : null,
          actor:
            typeof revision.actor_email === "string"
              ? revision.actor_email
              : input.email,
          origin:
            typeof revision.origin === "string" ? revision.origin : "import",
          saveKind: "import",
          createdAt:
            typeof revision.created_at === "string"
              ? revision.created_at
              : timestamp,
        });
      }
    } else
      for (const page of pages) {
        const hash = await sha256(page.markdown);
        revisionRows.push({
          id: uuid(),
          pageId: page.id,
          version: page.version,
          inline: page.markdown,
          key: null,
          hash,
          summary: "Imported current page",
          actor: input.email,
          origin: "import",
          saveKind: "import",
          createdAt: timestamp,
        });
      }
    const wikiSource =
        metadata.wiki && typeof metadata.wiki === "object"
          ? (metadata.wiki as Record<string, unknown>)
          : {},
      wikiTitle =
        typeof wikiSource.title === "string"
          ? wikiSource.title
          : "Imported Wiki",
      pageBytes = pages.reduce((sum, page) => sum + bytes(page.markdown), 0),
      inlineBytes = revisionRows.reduce(
        (sum, row) => sum + (row.inline ? bytes(row.inline) : 0),
        0,
      ),
      revisionR2Bytes = revisionRows.reduce(
        (sum, row) =>
          sum +
          (row.key
            ? Number(
                session.manifest.parts.find(
                  (part) =>
                    part.kind === "revision" && part.sha256 === row.hash,
                )?.size_bytes ??
                  bytes(
                    pages.find((page) => page.id === row.pageId)?.markdown ??
                      "",
                  ),
              )
            : 0),
        0,
      ),
      attachmentBytes = attachmentRows.reduce((sum, row) => sum + row.size, 0),
      statements = [
        d
          .prepare(
            `INSERT INTO wikis(id,slug,title,status,created_at,updated_at) VALUES(?,?,?,'active',?,?)`,
          )
          .bind(
            session.staging_wiki_id,
            `import-${session.staging_wiki_id.slice(0, 8)}`,
            wikiTitle,
            timestamp,
            timestamp,
          ),
        d
          .prepare(
            `INSERT INTO wiki_members(wiki_id,user_email,role,created_at) VALUES(?,?,'owner',?)`,
          )
          .bind(session.staging_wiki_id, input.email, timestamp),
        d
          .prepare(
            `INSERT INTO wiki_usage(wiki_id,page_bytes,revision_inline_bytes,r2_ready_revision_bytes,r2_ready_attachment_bytes,page_count,revision_count,attachment_count,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`,
          )
          .bind(
            session.staging_wiki_id,
            pageBytes,
            inlineBytes,
            revisionR2Bytes,
            attachmentBytes,
            pages.length,
            revisionRows.length,
            attachmentRows.length,
            timestamp,
          ),
        ...pages.map((page) =>
          d
            .prepare(
              `INSERT INTO pages(id,wiki_id,parent_id,parent_key,slug,title,page_type,markdown,source_url,retrieval_status,retrieved_at,extraction_method,confidence,frontmatter_json,version,sort_order,created_by,updated_by,last_operation_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            )
            .bind(
              page.id,
              session.staging_wiki_id,
              page.parentId,
              page.parentId ?? ROOT_PARENT,
              page.slug,
              page.title,
              page.pageType,
              page.markdown,
              page.sourceUrl,
              page.retrievalStatus,
              page.retrievedAt,
              page.extractionMethod,
              page.confidence,
              page.frontmatter,
              page.version,
              page.sortOrder,
              input.email,
              input.email,
              input.sessionId,
              page.createdAt,
              page.updatedAt,
            ),
        ),
        ...(operatingContract
          ? [
              d
                .prepare(
                  `INSERT INTO wiki_operating_contracts(wiki_id,version,contract_json,updated_by,updated_at,last_operation_id) VALUES(?,?,?,?,?,?)`,
                )
                .bind(
                  session.staging_wiki_id,
                  operatingContract.version,
                  stableJson(operatingContract.contract),
                  operatingContract.updatedBy,
                  operatingContract.updatedAt,
                  input.sessionId,
                ),
            ]
          : []),
        ...(knowledgeMapData
          ? [
              d
                .prepare(
                  `INSERT INTO knowledge_maps(wiki_id,version,overview_brief_json,overview_brief_basis_hash,updated_by,updated_at) VALUES(?,?,?,?,?,?)`,
                )
                .bind(
                  session.staging_wiki_id,
                  knowledgeMapData.version,
                  knowledgeMapData.overviewBriefJson,
                  knowledgeMapData.overviewBriefBasisHash,
                  knowledgeMapData.updatedBy,
                  knowledgeMapData.updatedAt,
                ),
              ...knowledgeMapData.topics.map((topic) =>
                d
                  .prepare(
                    `INSERT INTO knowledge_topics(id,wiki_id,parent_topic_id,title,summary,presentation,sort_order,is_locked,insight_brief_json,insight_brief_basis_hash,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                  )
                  .bind(
                    topic.id,
                    session.staging_wiki_id,
                    topic.parentId,
                    topic.title,
                    topic.summary,
                    topic.presentation,
                    topic.sortOrder,
                    topic.isLocked ? 1 : 0,
                    topic.insightBriefJson,
                    topic.insightBriefBasisHash,
                    topic.createdBy,
                    topic.updatedBy,
                    topic.createdAt,
                    topic.updatedAt,
                  ),
              ),
              ...knowledgeMapData.placements.map((placement) =>
                d
                  .prepare(
                    `INSERT INTO knowledge_placements(id,wiki_id,topic_id,page_id,role,summary,sort_order,is_locked,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
                  )
                  .bind(
                    placement.id,
                    session.staging_wiki_id,
                    placement.topicId,
                    placement.pageId,
                    placement.role,
                    placement.summary,
                    placement.sortOrder,
                    placement.isLocked ? 1 : 0,
                    placement.createdBy,
                    placement.updatedBy,
                    placement.createdAt,
                    placement.updatedAt,
                  ),
              ),
            ]
          : []),
        ...claimRows.map((claim) =>
          d
            .prepare(
              `INSERT INTO knowledge_claims(id,wiki_id,subject_page_id,predicate,object_page_id,object_value,source_page_id,evidence_fragment,confidence,observed_at,valid_from,valid_to,supersedes_claim_id,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            )
            .bind(
              claim.id,
              session.staging_wiki_id,
              claim.subjectPageId,
              claim.predicate,
              claim.objectPageId,
              claim.objectValue,
              claim.sourcePageId,
              claim.evidenceFragment,
              claim.confidence,
              claim.observedAt,
              claim.validFrom,
              claim.validTo,
              claim.supersedesClaimId,
              claim.createdBy,
              claim.createdAt,
              claim.updatedAt,
            ),
        ),
        ...revisionRows.map((row) =>
          d
            .prepare(
              `INSERT INTO page_revisions(id,page_id,version,snapshot_inline,snapshot_object_key,content_sha256,change_summary,actor_email,origin,save_kind,operation_id,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,'ready',?)`,
            )
            .bind(
              row.id,
              row.pageId,
              row.version,
              row.inline,
              row.key,
              row.hash,
              row.summary,
              row.actor,
              row.origin,
              row.saveKind,
              input.sessionId,
              row.createdAt,
            ),
        ),
        ...rawLinks.map((link) => {
          const source = importedUuid(
              link.source_page_id,
              "link.source_page_id",
            ),
            target =
              link.target_page_id === null
                ? null
                : importedUuid(link.target_page_id, "link.target_page_id");
          if (!pageIds.has(source) || (target && !pageIds.has(target)))
            throw new AppError(
              "validation_error",
              "An imported link references a missing page.",
              400,
              { source_page_id: source, target_page_id: target },
            );
          return d
            .prepare(
              `INSERT INTO page_links(id,wiki_id,source_page_id,target_page_id,target_text,link_kind,created_at) VALUES(?,?,?,?,?,?,?)`,
            )
            .bind(
              uuid(),
              session.staging_wiki_id,
              source,
              target,
              importedString(link.target_text, "link.target_text", 200),
              typeof link.link_kind === "string" ? link.link_kind : "wikilink",
              timestamp,
            );
        }),
        ...attachmentRows.map((row) =>
          d
            .prepare(
              `INSERT INTO attachments(id,wiki_id,page_id,object_key,filename,mime_type,size_bytes,sha256,uploaded_by,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,'ready',?)`,
            )
            .bind(
              row.id,
              session.staging_wiki_id,
              row.pageId,
              row.key,
              row.filename,
              row.mime,
              row.size,
              row.hash,
              input.email,
              row.createdAt,
            ),
        ),
        d
          .prepare(
            `INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) VALUES(?,?,?,'human','import.commit','wiki',?,'success',?,?,?)`,
          )
          .bind(
            uuid(),
            session.staging_wiki_id,
            input.email,
            session.staging_wiki_id,
            input.requestId,
            JSON.stringify({
              session_id: input.sessionId,
              page_count: pages.length,
              attachment_count: attachmentRows.length,
            }),
            timestamp,
          ),
        d
          .prepare(
            `UPDATE import_sessions SET status='committed',error_summary=NULL WHERE id=? AND actor_email=? AND status='committing'`,
          )
          .bind(input.sessionId, input.email),
        d
          .prepare(
            `UPDATE site_state SET active_wiki_id=?,bootstrap_status='active',reserved_by=NULL,reserved_at=NULL,lease_expires_at=NULL,version=version+1,updated_at=? WHERE id=1 AND bootstrap_status='reserved' AND reserved_by=?`,
          )
          .bind(session.staging_wiki_id, timestamp, input.email),
      ];
    await d.batch(statements);
    try {
      await env.FILES.delete(`imports/${input.sessionId}/part-0000`);
    } catch {}
    return {
      wiki_id: session.staging_wiki_id,
      title: wikiTitle,
      page_count: pages.length,
      link_count: rawLinks.length,
      claim_count: claimRows.length,
      attachment_count: attachmentRows.length,
      revision_count: revisionRows.length,
      status: "committed",
    };
  } catch (error) {
    await d
      .prepare(`UPDATE import_sessions SET error_summary=? WHERE id=?`)
      .bind(safeOperationalErrorTag(error), input.sessionId)
      .run();
    throw error;
  }
}

async function processPendingStorageRepairs(wikiId: string) {
  if (!env.FILES)
    throw new AppError(
      "retryable_storage_error",
      "Storage repair processing requires R2.",
      503,
      {},
      true,
    );
  const d = db(),
    repairs = await d
      .prepare(
        `SELECT id,object_key,kind,attempts FROM storage_repairs WHERE wiki_id=? AND status='pending' ORDER BY created_at LIMIT 100`,
      )
      .bind(wikiId)
      .all<{
        id: string;
        object_key: string;
        kind: string;
        attempts: number;
      }>();
  let resolvedRepairs = 0,
    deletedRepairObjects = 0;
  for (const repair of repairs.results) {
    const timestamp = now();
    try {
      if (repair.kind === "missing_object") {
        await d.batch([
          d
            .prepare(
              `UPDATE page_revisions SET status='missing' WHERE snapshot_object_key=? AND status='ready' AND EXISTS(SELECT 1 FROM pages p WHERE p.id=page_revisions.page_id AND p.wiki_id=?)`,
            )
            .bind(repair.object_key, wikiId),
          d
            .prepare(
              `UPDATE attachments SET status='failed' WHERE wiki_id=? AND object_key=? AND status IN ('ready','soft_deleted')`,
            )
            .bind(wikiId, repair.object_key),
        ]);
      } else {
        await env.FILES.delete(repair.object_key);
        deletedRepairObjects++;
        if (repair.kind === "finish_prune")
          await d
            .prepare(
              `UPDATE page_revisions SET status='pruned',snapshot_object_key=NULL,snapshot_inline=NULL WHERE snapshot_object_key=? AND status='pruning' AND EXISTS(SELECT 1 FROM pages p WHERE p.id=page_revisions.page_id AND p.wiki_id=?)`,
            )
            .bind(repair.object_key, wikiId)
            .run();
      }
      await d
        .prepare(
          `UPDATE storage_repairs SET status='resolved',attempts=attempts+1,last_error=NULL,updated_at=? WHERE id=? AND status='pending'`,
        )
        .bind(timestamp, repair.id)
        .run();
      resolvedRepairs++;
    } catch (error) {
      await d
        .prepare(
          `UPDATE storage_repairs SET attempts=attempts+1,last_error=?,updated_at=? WHERE id=? AND status='pending'`,
        )
        .bind(safeOperationalErrorTag(error), timestamp, repair.id)
        .run();
    }
  }
  return {
    resolved_repairs: resolvedRepairs,
    deleted_repair_objects: deletedRepairObjects,
  };
}

async function purgeExpiredAttachments(
  wikiId: string,
  timestamp: string,
  attachmentId: string | null = null,
) {
  if (!env.FILES)
    throw new AppError(
      "retryable_storage_error",
      "Attachment purge requires R2.",
      503,
      {},
      true,
    );
  const d = db(),
    purgeBefore = new Date(Date.now() - 30 * 86_400_000).toISOString(),
    purgeRows = await d
      .prepare(
        `SELECT id,object_key,size_bytes FROM attachments WHERE wiki_id=? AND status='soft_deleted' AND deleted_at<? AND (? IS NULL OR id=?) LIMIT 100`,
      )
      .bind(wikiId, purgeBefore, attachmentId, attachmentId)
      .all<{ id: string; object_key: string; size_bytes: number }>();
  let purgedAttachments = 0;
  for (const attachment of purgeRows.results) {
    await d
      .prepare(
        `UPDATE attachments SET status='deleting' WHERE id=? AND wiki_id=? AND status='soft_deleted'`,
      )
      .bind(attachment.id, wikiId)
      .run();
    try {
      await env.FILES.delete(attachment.object_key);
      await d.batch([
        d
          .prepare(
            `UPDATE attachments SET status='deleted' WHERE id=? AND wiki_id=? AND status='deleting'`,
          )
          .bind(attachment.id, wikiId),
        d
          .prepare(
            `UPDATE wiki_usage SET r2_soft_deleted_bytes=MAX(r2_soft_deleted_bytes-?,0),updated_at=? WHERE wiki_id=?`,
          )
          .bind(attachment.size_bytes, timestamp, wikiId),
      ]);
      purgedAttachments++;
    } catch (error) {
      await d
        .prepare(
          `INSERT INTO storage_repairs(id,wiki_id,object_key,kind,status,last_error,created_at,updated_at) VALUES(?,?,?,'pending_delete','pending',?,?,?)`,
        )
        .bind(
          uuid(),
          wikiId,
          attachment.object_key,
          safeOperationalErrorTag(error),
          timestamp,
          timestamp,
        )
        .run();
    }
  }
  return purgedAttachments;
}

export async function runStorageMaintenance(input: {
  wikiId: string;
  email: string;
  requestId: string;
}) {
  if (!env.FILES)
    throw new AppError(
      "retryable_storage_error",
      "Storage maintenance requires R2.",
      503,
      {},
      true,
    );
  const d = db(),
    timestamp = now(),
    repairSummary = await processPendingStorageRepairs(input.wikiId),
    purgedAttachments = await purgeExpiredAttachments(input.wikiId, timestamp);
  let missingRevisions = 0,
    missingAttachments = 0,
    deletedOrphans = 0,
    tieredRevisions = 0,
    prunedRevisions = 0,
    expiredImports = 0;
  const expiredSessions = await d
    .prepare(
      `SELECT id FROM import_sessions WHERE status NOT IN ('committed','expired') AND expires_at<? LIMIT 20`,
    )
    .bind(timestamp)
    .all<{ id: string }>();
  for (const session of expiredSessions.results) {
    let cursor: string | undefined;
    do {
      const listed = await env.FILES.list({
        prefix: `imports/${session.id}/`,
        cursor,
        limit: 1000,
      });
      for (const object of listed.objects) await env.FILES.delete(object.key);
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
    await d
      .prepare(
        `UPDATE import_sessions SET status='expired',error_summary='staging_expired' WHERE id=?`,
      )
      .bind(session.id)
      .run();
    expiredImports++;
  }
  await d
    .prepare(
      `DELETE FROM idempotency_keys WHERE expires_at<? AND status!='pending'`,
    )
    .bind(timestamp)
    .run();
  const revisionPointers = await d
    .prepare(
      `SELECT id,snapshot_object_key,content_sha256,status FROM page_revisions WHERE snapshot_object_key IS NOT NULL AND status IN ('ready','pruning') AND page_id IN (SELECT id FROM pages WHERE wiki_id=?)`,
    )
    .bind(input.wikiId)
    .all<{
      id: string;
      snapshot_object_key: string;
      content_sha256: string;
      status: string;
    }>();
  for (const revision of revisionPointers.results) {
    const object = await env.FILES.head(revision.snapshot_object_key);
    if (revision.status === "pruning") {
      if (object) await env.FILES.delete(revision.snapshot_object_key);
      await d
        .prepare(
          `UPDATE page_revisions SET status='pruned',snapshot_object_key=NULL,snapshot_inline=NULL WHERE id=? AND status='pruning'`,
        )
        .bind(revision.id)
        .run();
      prunedRevisions++;
      continue;
    }
    if (!object) {
      await d
        .prepare(
          `UPDATE page_revisions SET status='missing' WHERE id=? AND status='ready'`,
        )
        .bind(revision.id)
        .run();
      missingRevisions++;
    }
  }
  const attachmentPointers = await d
    .prepare(
      `SELECT id,object_key,status FROM attachments WHERE wiki_id=? AND status IN ('ready','soft_deleted','deleting')`,
    )
    .bind(input.wikiId)
    .all<{ id: string; object_key: string; status: string }>();
  for (const attachment of attachmentPointers.results)
    if (!(await env.FILES.head(attachment.object_key))) {
      if (attachment.status === "deleting")
        await d
          .prepare(`UPDATE attachments SET status='deleted' WHERE id=?`)
          .bind(attachment.id)
          .run();
      else {
        await d
          .prepare(`UPDATE attachments SET status='failed' WHERE id=?`)
          .bind(attachment.id)
          .run();
        missingAttachments++;
      }
    }
  const knownRevisionKeys = new Set(
      revisionPointers.results.map((row) => row.snapshot_object_key),
    ),
    knownAttachmentKeys = new Set(
      attachmentPointers.results.map((row) => row.object_key),
    );
  for (const [prefix, known] of [
    [`revisions/${input.wikiId}/`, knownRevisionKeys],
    [`attachments/${input.wikiId}/`, knownAttachmentKeys],
  ] as const) {
    let cursor: string | undefined;
    do {
      const listed = await env.FILES.list({ prefix, cursor, limit: 1000 });
      for (const object of listed.objects)
        if (!known.has(object.key)) {
          await env.FILES.delete(object.key);
          deletedOrphans++;
        }
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
  }
  const tierCandidates = await d
    .prepare(
      `SELECT r.id,r.page_id,r.version,r.snapshot_inline,r.content_sha256 FROM page_revisions r JOIN pages p ON p.id=r.page_id WHERE p.wiki_id=? AND r.status='ready' AND r.snapshot_inline IS NOT NULL AND r.created_at<? ORDER BY r.created_at LIMIT 20`,
    )
    .bind(input.wikiId, new Date(Date.now() - 30 * 86_400_000).toISOString())
    .all<{
      id: string;
      page_id: string;
      version: number;
      snapshot_inline: string;
      content_sha256: string;
    }>();
  for (const revision of tierCandidates.results) {
    const key = `revisions/${input.wikiId}/${revision.page_id}/${revision.version}-tiered.md`,
      saved = await putVerified(
        key,
        revision.snapshot_inline,
        "text/markdown; charset=utf-8",
      );
    if (saved.hash !== revision.content_sha256) {
      await env.FILES.delete(key);
      continue;
    }
    const moved = await d
      .prepare(
        `UPDATE page_revisions SET snapshot_inline=NULL,snapshot_object_key=? WHERE id=? AND status='ready' AND snapshot_inline IS NOT NULL AND content_sha256=?`,
      )
      .bind(key, revision.id, revision.content_sha256)
      .run();
    if ((moved.meta.changes ?? 0) === 1) tieredRevisions++;
    else await env.FILES.delete(key);
  }
  const rows = await d
      .prepare(
        `SELECT r.id,r.page_id,r.version,r.snapshot_object_key,r.save_kind,r.is_pinned,r.created_at,EXISTS(SELECT 1 FROM backup_revision_coverage c JOIN backup_runs b ON b.id=c.backup_run_id WHERE c.revision_id=r.id AND b.profile='full' AND b.acknowledged_at IS NOT NULL) AS covered FROM page_revisions r JOIN pages p ON p.id=r.page_id WHERE p.wiki_id=? AND r.status='ready' ORDER BY r.page_id,r.version DESC`,
      )
      .bind(input.wikiId)
      .all<{
        id: string;
        page_id: string;
        version: number;
        snapshot_object_key: string | null;
        save_kind: string;
        is_pinned: number;
        created_at: string;
        covered: number;
      }>(),
    candidates = selectRevisionPruneCandidates(
      rows.results as RevisionRetentionRow[],
    );
  for (const revision of candidates.slice(0, 100)) {
    if (revision.snapshot_object_key) {
      const marked = await d
        .prepare(
          `UPDATE page_revisions SET status='pruning' WHERE id=? AND status='ready'`,
        )
        .bind(revision.id)
        .run();
      if ((marked.meta.changes ?? 0) !== 1) continue;
      try {
        await env.FILES.delete(revision.snapshot_object_key);
        await d
          .prepare(
            `UPDATE page_revisions SET status='pruned',snapshot_object_key=NULL,snapshot_inline=NULL WHERE id=? AND status='pruning'`,
          )
          .bind(revision.id)
          .run();
        prunedRevisions++;
      } catch (error) {
        await d
          .prepare(
            `INSERT INTO storage_repairs(id,wiki_id,object_key,kind,status,last_error,created_at,updated_at) VALUES(?,?,?,'finish_prune','pending',?,?,?)`,
          )
          .bind(
            uuid(),
            input.wikiId,
            revision.snapshot_object_key,
            safeOperationalErrorTag(error),
            timestamp,
            timestamp,
          )
          .run();
      }
    } else {
      await d
        .prepare(
          `UPDATE page_revisions SET status='pruned',snapshot_inline=NULL WHERE id=? AND status='ready'`,
        )
        .bind(revision.id)
        .run();
      prunedRevisions++;
    }
  }
  const pageRows = await d
      .prepare(
        `SELECT markdown FROM pages WHERE wiki_id=? AND deleted_at IS NULL`,
      )
      .bind(input.wikiId)
      .all<{ markdown: string }>(),
    inlineRows = await d
      .prepare(
        `SELECT snapshot_inline FROM page_revisions WHERE page_id IN (SELECT id FROM pages WHERE wiki_id=?) AND status='ready' AND snapshot_inline IS NOT NULL`,
      )
      .bind(input.wikiId)
      .all<{ snapshot_inline: string }>(),
    revisionObjectRows = await d
      .prepare(
        `SELECT snapshot_object_key FROM page_revisions WHERE page_id IN (SELECT id FROM pages WHERE wiki_id=?) AND status='ready' AND snapshot_object_key IS NOT NULL`,
      )
      .bind(input.wikiId)
      .all<{ snapshot_object_key: string }>(),
    attachmentRows = await d
      .prepare(`SELECT size_bytes,status FROM attachments WHERE wiki_id=?`)
      .bind(input.wikiId)
      .all<{ size_bytes: number; status: string }>();
  let revisionR2 = 0;
  for (const row of revisionObjectRows.results)
    revisionR2 += Number(
      (await env.FILES.head(row.snapshot_object_key))?.size ?? 0,
    );
  const attachmentReady = attachmentRows.results.filter(
      (row) => row.status === "ready",
    ),
    attachmentSoft = attachmentRows.results.filter(
      (row) => row.status === "soft_deleted",
    );
  const maintenanceSummary = {
    ...repairSummary,
    missing_revisions: missingRevisions,
    missing_attachments: missingAttachments,
    deleted_orphans: deletedOrphans,
    tiered_revisions: tieredRevisions,
    pruned_revisions: prunedRevisions,
    purged_attachments: purgedAttachments,
    expired_imports: expiredImports,
  };
  await d.batch([
    d
      .prepare(
        `UPDATE wiki_usage SET page_bytes=?,revision_inline_bytes=?,r2_ready_revision_bytes=?,r2_ready_attachment_bytes=?,r2_soft_deleted_bytes=?,r2_pending_bytes=0,r2_orphan_estimate_bytes=0,page_count=?,revision_count=?,attachment_count=?,updated_at=? WHERE wiki_id=?`,
      )
      .bind(
        pageRows.results.reduce((sum, row) => sum + bytes(row.markdown), 0),
        inlineRows.results.reduce(
          (sum, row) => sum + bytes(row.snapshot_inline),
          0,
        ),
        revisionR2,
        attachmentReady.reduce((sum, row) => sum + row.size_bytes, 0),
        attachmentSoft.reduce((sum, row) => sum + row.size_bytes, 0),
        pageRows.results.length,
        inlineRows.results.length + revisionObjectRows.results.length,
        attachmentReady.length,
        timestamp,
        input.wikiId,
      ),
    d
      .prepare(
        `INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) VALUES(?,?,?,'human','storage.maintenance','wiki',?,'success',?,?,?)`,
      )
      .bind(
        uuid(),
        input.wikiId,
        input.email,
        input.wikiId,
        input.requestId,
        JSON.stringify(maintenanceSummary),
        timestamp,
      ),
  ]);
  return maintenanceSummary;
}

type KnowledgeTopicRow = {
  id: string;
  wiki_id: string;
  parent_topic_id: string | null;
  title: string;
  summary: string;
  presentation: KnowledgePresentation;
  sort_order: number;
  is_locked: number;
  insight_brief_json: string | null;
  insight_brief_basis_hash: string | null;
  created_at: string;
  updated_at: string;
};

type KnowledgePlacementRow = {
  id: string;
  topic_id: string;
  page_id: string;
  role: KnowledgePlacementRole;
  summary: string;
  sort_order: number;
  is_locked: number;
  page_title: string;
  page_type: PageType;
  page_version: number;
  page_path: string;
};

type ResolvedKnowledgeInsightEvidenceReference =
  | { claim_id: string }
  | { page_id: string };
type ResolvedKnowledgeInsightBrief = Omit<
  KnowledgeInsightBrief,
  "takeaways" | "tensions" | "implications" | "questions"
> & {
  takeaways: Array<
    Omit<KnowledgeInsightBrief["takeaways"][number], "evidence"> & {
      evidence: ResolvedKnowledgeInsightEvidenceReference[];
    }
  >;
  tensions: Array<
    Omit<KnowledgeInsightBrief["tensions"][number], "evidence"> & {
      evidence: ResolvedKnowledgeInsightEvidenceReference[];
    }
  >;
  implications: Array<
    Omit<KnowledgeInsightBrief["implications"][number], "evidence"> & {
      evidence: ResolvedKnowledgeInsightEvidenceReference[];
    }
  >;
  questions: Array<
    Omit<KnowledgeInsightBrief["questions"][number], "evidence"> & {
      evidence: ResolvedKnowledgeInsightEvidenceReference[];
    }
  >;
};

function parseStoredInsightBrief(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as ResolvedKnowledgeInsightBrief;
  } catch {
    return null;
  }
}

async function resolveInsightEvidenceReference(
  wikiId: string,
  reference: KnowledgeInsightEvidenceReference,
  pageState?: IngestActionState,
): Promise<ResolvedKnowledgeInsightEvidenceReference> {
  if ("claim_id" in reference) {
    await getClaim(wikiId, reference.claim_id);
    return { claim_id: reference.claim_id };
  }
  const page = await resolvePageReference(wikiId, reference, pageState);
  return { page_id: page.id };
}

async function resolveKnowledgeInsightBrief(
  wikiId: string,
  brief: KnowledgeInsightBrief,
  pageState?: IngestActionState,
): Promise<ResolvedKnowledgeInsightBrief> {
  async function resolveItems(items: KnowledgeInsightBrief["takeaways"]) {
    return Promise.all(
      items.map(async (item) => {
        const evidence = await Promise.all(
          item.evidence.map((reference) =>
            resolveInsightEvidenceReference(wikiId, reference, pageState),
          ),
        );
        const keys = evidence.map((reference) =>
          "claim_id" in reference
            ? `claim:${reference.claim_id}`
            : `page:${reference.page_id}`,
        );
        if (new Set(keys).size !== keys.length)
          throw new AppError(
            "validation_error",
            "An insight item cannot cite the same evidence more than once.",
            400,
          );
        return { ...item, evidence };
      }),
    );
  }
  return {
    headline: brief.headline,
    synthesis: brief.synthesis,
    takeaways: await resolveItems(brief.takeaways),
    tensions: await resolveItems(brief.tensions),
    implications: await resolveItems(brief.implications),
    questions: await resolveItems(brief.questions),
  };
}

async function validateKnowledgeInsightBriefReferences(input: {
  wikiId: string;
  brief: KnowledgeInsightBrief;
  pendingPageTitles?: Set<string>;
}) {
  for (const item of [
    ...input.brief.takeaways,
    ...input.brief.tensions,
    ...input.brief.implications,
    ...input.brief.questions,
  ]) {
    const canonical = new Set<string>();
    for (const reference of item.evidence) {
      if ("claim_id" in reference) {
        await getClaim(input.wikiId, reference.claim_id);
        canonical.add(`claim:${reference.claim_id}`);
        continue;
      }
      if (
        reference.title &&
        input.pendingPageTitles?.has(titleKey(reference.title))
      ) {
        canonical.add(`pending:${titleKey(reference.title)}`);
        continue;
      }
      const page = await resolvePageReference(input.wikiId, reference);
      canonical.add(`page:${page.id}`);
    }
    if (canonical.size !== item.evidence.length)
      throw new AppError(
        "validation_error",
        "An insight item cannot cite the same evidence more than once.",
        400,
      );
  }
}

function insightBriefPageIds(brief: ResolvedKnowledgeInsightBrief | null) {
  const ids = new Set<string>();
  if (!brief) return ids;
  for (const item of [
    ...brief.takeaways,
    ...brief.tensions,
    ...brief.implications,
    ...brief.questions,
  ])
    for (const reference of item.evidence)
      if ("page_id" in reference) ids.add(reference.page_id);
  return ids;
}

async function knowledgeInsightBasisHash(input: {
  wikiId: string;
  topicId: string | null;
  brief: ResolvedKnowledgeInsightBrief | null;
}) {
  const d = db(),
    topics = await d
      .prepare(
        `SELECT id,parent_topic_id,title,summary,presentation,sort_order,is_locked FROM knowledge_topics WHERE wiki_id=? AND deleted_at IS NULL ORDER BY id`,
      )
      .bind(input.wikiId)
      .all<Record<string, unknown>>(),
    scopeIds = new Set<string>();
  if (input.topicId) {
    scopeIds.add(input.topicId);
    for (let depth = 0; depth < 4; depth += 1)
      for (const topic of topics.results)
        if (
          typeof topic.parent_topic_id === "string" &&
          scopeIds.has(topic.parent_topic_id)
        )
          scopeIds.add(String(topic.id));
  } else {
    for (const topic of topics.results) scopeIds.add(String(topic.id));
  }
  const scopedTopics = topics.results.filter((topic) =>
      scopeIds.has(String(topic.id)),
    ),
    placements = scopeIds.size
      ? await d
          .prepare(
            `SELECT id,topic_id,page_id,role,summary,sort_order,is_locked FROM knowledge_placements WHERE wiki_id=? AND deleted_at IS NULL ORDER BY id`,
          )
          .bind(input.wikiId)
          .all<Record<string, unknown>>()
      : { results: [] as Record<string, unknown>[] },
    scopedPlacements = placements.results.filter((placement) =>
      scopeIds.has(String(placement.topic_id)),
    ),
    pageIds = insightBriefPageIds(input.brief),
    citedClaimIds = new Set<string>();
  if (input.brief)
    for (const item of [
      ...input.brief.takeaways,
      ...input.brief.tensions,
      ...input.brief.implications,
      ...input.brief.questions,
    ])
      for (const reference of item.evidence)
        if ("claim_id" in reference) citedClaimIds.add(reference.claim_id);
  for (const placement of scopedPlacements)
    pageIds.add(String(placement.page_id));
  const pageRows =
      pageIds.size || citedClaimIds.size
        ? await d
            .prepare(
              `SELECT id,version,updated_at,deleted_at FROM pages WHERE wiki_id=? ORDER BY id`,
            )
            .bind(input.wikiId)
            .all<Record<string, unknown>>()
        : { results: [] as Record<string, unknown>[] },
    claimRows =
      pageIds.size || citedClaimIds.size
        ? await d
            .prepare(
              `SELECT id,subject_page_id,predicate,object_page_id,object_value,source_page_id,evidence_fragment,confidence,valid_from,valid_to,supersedes_claim_id,updated_at FROM knowledge_claims WHERE wiki_id=? AND deleted_at IS NULL ORDER BY id`,
            )
            .bind(input.wikiId)
            .all<Record<string, unknown>>()
        : { results: [] as Record<string, unknown>[] };
  const scopedClaims = claimRows.results.filter(
    (claim) =>
      pageIds.has(String(claim.subject_page_id)) ||
      citedClaimIds.has(String(claim.id)),
  );
  for (const claim of scopedClaims) {
    pageIds.add(String(claim.subject_page_id));
    pageIds.add(String(claim.source_page_id));
  }
  const allRelevantPages = pageRows.results.filter((page) =>
    pageIds.has(String(page.id)),
  );
  return sha256(
    stableJson({
      topics: scopedTopics,
      placements: scopedPlacements,
      pages: allRelevantPages,
      claims: scopedClaims,
    }),
  );
}

async function expandKnowledgeInsightBrief(
  wikiId: string,
  brief: ResolvedKnowledgeInsightBrief | null,
) {
  if (!brief) return null;
  const d = db();
  async function expandItems(
    items: ResolvedKnowledgeInsightBrief["takeaways"],
  ) {
    return Promise.all(
      items.map(async (item) => ({
        ...item,
        evidence: await Promise.all(
          item.evidence.map(async (reference) => {
            if ("page_id" in reference) {
              const page = await d
                .prepare(
                  `SELECT id,title,page_type,version,slug AS path FROM pages WHERE id=? AND wiki_id=? AND deleted_at IS NULL`,
                )
                .bind(reference.page_id, wikiId)
                .first<{
                  id: string;
                  title: string;
                  page_type: PageType;
                  version: number;
                  path: string;
                }>();
              return {
                kind: "page" as const,
                page_id: reference.page_id,
                status: page ? ("current" as const) : ("missing" as const),
                page: page ? { ...page, version: Number(page.version) } : null,
              };
            }
            const claim = await d
              .prepare(
                `SELECT c.id,c.evidence_fragment,c.confidence,c.valid_to,c.subject_page_id,c.source_page_id,p.title AS source_title,p.page_type AS source_page_type,p.version AS source_version,p.slug AS source_path,EXISTS(SELECT 1 FROM knowledge_claims newer WHERE newer.wiki_id=c.wiki_id AND newer.supersedes_claim_id=c.id AND newer.deleted_at IS NULL) AS is_superseded FROM knowledge_claims c LEFT JOIN pages p ON p.id=c.source_page_id AND p.wiki_id=c.wiki_id AND p.deleted_at IS NULL WHERE c.id=? AND c.wiki_id=? AND c.deleted_at IS NULL`,
              )
              .bind(reference.claim_id, wikiId)
              .first<{
                id: string;
                evidence_fragment: string;
                confidence: number;
                valid_to: string | null;
                subject_page_id: string;
                source_page_id: string;
                source_title: string | null;
                source_page_type: PageType | null;
                source_version: number | null;
                source_path: string | null;
                is_superseded: number;
              }>();
            const status = !claim
              ? ("missing" as const)
              : claim.is_superseded
                ? ("superseded" as const)
                : claim.valid_to && claim.valid_to < now()
                  ? ("expired" as const)
                  : ("current" as const);
            return {
              kind: "claim" as const,
              claim_id: reference.claim_id,
              status,
              evidence_fragment: claim?.evidence_fragment ?? null,
              confidence:
                claim?.confidence === undefined
                  ? null
                  : Number(claim.confidence),
              subject_page_id: claim?.subject_page_id ?? null,
              source_page: claim?.source_title
                ? {
                    id: claim.source_page_id,
                    title: claim.source_title,
                    page_type: claim.source_page_type,
                    version: Number(claim.source_version),
                    path: claim.source_path,
                  }
                : null,
            };
          }),
        ),
      })),
    );
  }
  return {
    headline: brief.headline,
    synthesis: brief.synthesis,
    takeaways: await expandItems(brief.takeaways),
    tensions: await expandItems(brief.tensions),
    implications: await expandItems(brief.implications),
    questions: await expandItems(brief.questions),
  };
}

async function currentKnowledgeMapVersion(wikiId: string) {
  const row = await db()
    .prepare(`SELECT version FROM knowledge_maps WHERE wiki_id=?`)
    .bind(wikiId)
    .first<{ version: number }>();
  return Number(row?.version ?? 0);
}

export async function getKnowledgeMap(wikiId: string) {
  const d = db(),
    [
      mapRow,
      topicRows,
      placementRows,
      unmappedRows,
      evidenceRows,
      orphanPlacementRows,
    ] = await Promise.all([
      d
        .prepare(
          `SELECT version,overview_brief_json,overview_brief_basis_hash,updated_by,updated_at FROM knowledge_maps WHERE wiki_id=?`,
        )
        .bind(wikiId)
        .first<{
          version: number;
          overview_brief_json: string | null;
          overview_brief_basis_hash: string | null;
          updated_by: string;
          updated_at: string;
        }>(),
      d
        .prepare(
          `SELECT id,wiki_id,parent_topic_id,title,summary,presentation,sort_order,is_locked,insight_brief_json,insight_brief_basis_hash,created_at,updated_at FROM knowledge_topics WHERE wiki_id=? AND deleted_at IS NULL ORDER BY parent_topic_id,sort_order,title,id`,
        )
        .bind(wikiId)
        .all<KnowledgeTopicRow>(),
      d
        .prepare(
          `SELECT kp.id,kp.topic_id,kp.page_id,kp.role,kp.summary,kp.sort_order,kp.is_locked,p.title AS page_title,p.page_type AS page_type,p.version AS page_version,p.slug AS page_path FROM knowledge_placements kp JOIN pages p ON p.id=kp.page_id AND p.wiki_id=kp.wiki_id AND p.deleted_at IS NULL WHERE kp.wiki_id=? AND kp.deleted_at IS NULL ORDER BY kp.topic_id,kp.sort_order,p.title,kp.id`,
        )
        .bind(wikiId)
        .all<KnowledgePlacementRow>(),
      d
        .prepare(
          `SELECT p.id,p.title,p.page_type,p.version,p.slug AS path FROM pages p WHERE p.wiki_id=? AND p.deleted_at IS NULL AND p.page_type!='folder' AND NOT EXISTS(SELECT 1 FROM knowledge_placements kp WHERE kp.wiki_id=p.wiki_id AND kp.page_id=p.id AND kp.deleted_at IS NULL) ORDER BY p.title LIMIT 200`,
        )
        .bind(wikiId)
        .all<{
          id: string;
          title: string;
          page_type: PageType;
          version: number;
          path: string;
        }>(),
      d
        .prepare(
          `SELECT subject_page_id AS page_id,COUNT(*) AS claim_count,COUNT(DISTINCT source_page_id) AS source_count,AVG(confidence) AS average_confidence,SUM(CASE WHEN valid_to IS NOT NULL AND valid_to<? THEN 1 ELSE 0 END) AS expired_count,SUM(CASE WHEN supersedes_claim_id IS NOT NULL THEN 1 ELSE 0 END) AS superseded_count FROM knowledge_claims WHERE wiki_id=? AND deleted_at IS NULL GROUP BY subject_page_id`,
        )
        .bind(now(), wikiId)
        .all<{
          page_id: string;
          claim_count: number;
          source_count: number;
          average_confidence: number | null;
          expired_count: number;
          superseded_count: number;
        }>(),
      d
        .prepare(
          `SELECT kp.id,kp.page_id,kp.topic_id FROM knowledge_placements kp LEFT JOIN pages p ON p.id=kp.page_id AND p.wiki_id=kp.wiki_id WHERE kp.wiki_id=? AND kp.deleted_at IS NULL AND (p.id IS NULL OR p.deleted_at IS NOT NULL) ORDER BY kp.updated_at LIMIT 100`,
        )
        .bind(wikiId)
        .all<{ id: string; page_id: string; topic_id: string }>(),
    ]),
    evidenceByPage = new Map(
      evidenceRows.results.map((row) => [
        row.page_id,
        {
          claim_count: Number(row.claim_count),
          source_count: Number(row.source_count),
          average_confidence:
            row.average_confidence === null
              ? null
              : Number(row.average_confidence),
          expired_count: Number(row.expired_count),
          superseded_count: Number(row.superseded_count),
        },
      ]),
    ),
    placements = placementRows.results.map((placement) => ({
      id: placement.id,
      topic_id: placement.topic_id,
      page_id: placement.page_id,
      role: placement.role,
      summary: placement.summary,
      sort_order: Number(placement.sort_order),
      is_locked: Boolean(placement.is_locked),
      page: {
        id: placement.page_id,
        title: placement.page_title,
        page_type: placement.page_type,
        version: Number(placement.page_version),
        path: placement.page_path,
      },
      evidence: evidenceByPage.get(placement.page_id) ?? {
        claim_count: 0,
        source_count: 0,
        average_confidence: null,
        expired_count: 0,
        superseded_count: 0,
      },
    })),
    topicCounts = new Map<string, number>(),
    topicEvidenceSources = new Map<string, number>();
  for (const placement of placements) {
    topicCounts.set(
      placement.topic_id,
      (topicCounts.get(placement.topic_id) ?? 0) + 1,
    );
    topicEvidenceSources.set(
      placement.topic_id,
      (topicEvidenceSources.get(placement.topic_id) ?? 0) +
        placement.evidence.source_count,
    );
  }
  const overviewBrief = parseStoredInsightBrief(
      mapRow?.overview_brief_json ?? null,
    ),
    overviewBasisHash = overviewBrief
      ? await knowledgeInsightBasisHash({
          wikiId,
          topicId: null,
          brief: overviewBrief,
        })
      : null,
    topicBriefs = new Map(
      await Promise.all(
        topicRows.results.map(async (topic) => {
          const brief = parseStoredInsightBrief(topic.insight_brief_json),
            currentHash = brief
              ? await knowledgeInsightBasisHash({
                  wikiId,
                  topicId: topic.id,
                  brief,
                })
              : null;
          return [
            topic.id,
            {
              brief,
              expanded: await expandKnowledgeInsightBrief(wikiId, brief),
              status: !brief
                ? ("missing" as const)
                : currentHash === topic.insight_brief_basis_hash
                  ? ("current" as const)
                  : ("stale" as const),
            },
          ] as const;
        }),
      ),
    ),
    overviewStatus = !overviewBrief
      ? ("missing" as const)
      : overviewBasisHash === mapRow?.overview_brief_basis_hash
        ? ("current" as const)
        : ("stale" as const),
    warnings = [
      ...unmappedRows.results.map((page) => ({
        code: "unmapped_page",
        page_id: page.id,
        topic_id: null,
        message: `${page.title} needs a semantic placement.`,
      })),
      ...topicRows.results
        .filter((topic) => (topicCounts.get(topic.id) ?? 0) > 12)
        .map((topic) => ({
          code: "overfull_topic",
          page_id: null,
          topic_id: topic.id,
          message: `${topic.title} has more than 12 directly placed pages.`,
        })),
      ...orphanPlacementRows.results.map((placement) => ({
        code: "deleted_page_reference",
        page_id: placement.page_id,
        topic_id: placement.topic_id,
        message: "A semantic placement references a deleted or missing page.",
      })),
      ...topicRows.results
        .filter(
          (topic) =>
            topic.presentation !== "questions" &&
            topic.presentation !== "evidence" &&
            (topicCounts.get(topic.id) ?? 0) > 0 &&
            (topicEvidenceSources.get(topic.id) ?? 0) === 0,
        )
        .map((topic) => ({
          code: "insufficient_evidence",
          page_id: null,
          topic_id: topic.id,
          message: `${topic.title} has no independently linked source evidence.`,
        })),
      ...(overviewStatus === "stale"
        ? [
            {
              code: "insight_stale",
              page_id: null,
              topic_id: null,
              message:
                "The approved all-topics insight brief no longer matches its evidence basis.",
            },
          ]
        : []),
      ...topicRows.results
        .filter((topic) => topicBriefs.get(topic.id)?.status === "stale")
        .map((topic) => ({
          code: "insight_stale",
          page_id: null,
          topic_id: topic.id,
          message: `The approved insight brief for ${topic.title} no longer matches its evidence basis.`,
        })),
    ];
  return {
    wiki_id: wikiId,
    exists: Boolean(mapRow),
    version: Number(mapRow?.version ?? 0),
    updated_by: mapRow?.updated_by ?? null,
    updated_at: mapRow?.updated_at ?? null,
    overview_brief: await expandKnowledgeInsightBrief(wikiId, overviewBrief),
    overview_brief_status: overviewStatus,
    topics: topicRows.results.map((topic) => {
      const brief = topicBriefs.get(topic.id)!;
      return {
        id: topic.id,
        wiki_id: topic.wiki_id,
        parent_topic_id: topic.parent_topic_id,
        title: topic.title,
        summary: topic.summary,
        presentation: topic.presentation,
        sort_order: Number(topic.sort_order),
        is_locked: Boolean(topic.is_locked),
        created_at: topic.created_at,
        updated_at: topic.updated_at,
        insight_brief: brief.expanded,
        insight_brief_status: brief.status,
      };
    }),
    placements,
    unmapped_pages: unmappedRows.results,
    warnings,
    content_trust: "untrusted_wiki_content" as const,
  };
}

async function resolveKnowledgeTopicReference(
  wikiId: string,
  reference: TopicReference,
  idsByClientKey: Map<string, string>,
) {
  const topicId = reference.topic_id
    ? reference.topic_id
    : idsByClientKey.get(reference.client_key!);
  if (!topicId)
    throw new AppError(
      "validation_error",
      "A knowledge topic reference could not be resolved.",
      409,
      { reference },
    );
  const topic = await db()
    .prepare(
      `SELECT id,is_locked FROM knowledge_topics WHERE id=? AND wiki_id=? AND deleted_at IS NULL`,
    )
    .bind(topicId, wikiId)
    .first<{ id: string; is_locked: number }>();
  if (!topic && ![...idsByClientKey.values()].includes(topicId))
    throw new AppError("not_found", "The knowledge topic was not found.", 404, {
      topic_id: topicId,
    });
  return { id: topicId, is_locked: Boolean(topic?.is_locked) };
}

async function validateKnowledgeHierarchy(input: {
  wikiId: string;
  patch: KnowledgeMapPatch;
  idsByClientKey: Map<string, string>;
}) {
  const existing = await db()
      .prepare(
        `SELECT id,parent_topic_id FROM knowledge_topics WHERE wiki_id=? AND deleted_at IS NULL`,
      )
      .bind(input.wikiId)
      .all<{ id: string; parent_topic_id: string | null }>(),
    parentById = new Map(
      existing.results.map((row) => [row.id, row.parent_topic_id]),
    );
  for (const draft of input.patch.topics) {
    const id = input.idsByClientKey.get(draft.client_key)!;
    parentById.set(
      id,
      draft.parent
        ? (
            await resolveKnowledgeTopicReference(
              input.wikiId,
              draft.parent,
              input.idsByClientKey,
            )
          ).id
        : null,
    );
  }
  for (const id of parentById.keys()) {
    const seen = new Set<string>();
    let cursor: string | null | undefined = id,
      depth = 0;
    while (cursor) {
      if (seen.has(cursor))
        throw new AppError(
          "validation_error",
          "Knowledge topics cannot contain a cycle.",
          400,
          { topic_id: id },
        );
      seen.add(cursor);
      cursor = parentById.get(cursor);
      depth += 1;
      if (depth > 4)
        throw new AppError(
          "validation_error",
          "Knowledge topics cannot be nested deeper than four levels.",
          400,
          { topic_id: id },
        );
    }
  }
}

export async function validateKnowledgeMapPatch(input: {
  wikiId: string;
  patch: KnowledgeMapPatch;
  allowLocked?: boolean;
  pendingPageTitles?: Set<string>;
}) {
  const version = await currentKnowledgeMapVersion(input.wikiId);
  if (version !== input.patch.expected_version)
    throw new AppError(
      "version_conflict",
      "The knowledge map changed after it was read.",
      409,
      {
        expected_version: input.patch.expected_version,
        actual_version: version,
        next_action: "Read the current knowledge map and create a new plan.",
      },
    );
  const idsByClientKey = new Map(
      input.patch.topics.map((topic) => [
        topic.client_key,
        topic.topic_id ?? uuid(),
      ]),
    ),
    forbiddenHeadings = new Set([
      "folder",
      "note",
      "source",
      "concept",
      "concepts",
      "entity",
      "entities",
      "synthesis",
      "comparison",
      "query",
      "overview",
    ]);
  for (const topic of input.patch.topics) {
    if (forbiddenHeadings.has(topic.title.trim().toLocaleLowerCase()))
      throw new AppError(
        "validation_error",
        "Knowledge topic titles must express a subject rather than repeat a page type.",
        400,
        { title: topic.title },
      );
    if (!KNOWLEDGE_PRESENTATIONS.includes(topic.presentation))
      throw new AppError(
        "validation_error",
        "Knowledge topic presentation is not supported.",
        400,
        { presentation: topic.presentation },
      );
    if (topic.topic_id) {
      const current = await db()
        .prepare(
          `SELECT is_locked FROM knowledge_topics WHERE id=? AND wiki_id=? AND deleted_at IS NULL`,
        )
        .bind(topic.topic_id, input.wikiId)
        .first<{ is_locked: number }>();
      if (!current)
        throw new AppError(
          "not_found",
          "The knowledge topic was not found.",
          404,
          {
            topic_id: topic.topic_id,
          },
        );
      if (current.is_locked && !input.allowLocked)
        throw new AppError(
          "version_conflict",
          "A user-locked knowledge topic cannot be changed by an LLM plan.",
          409,
          { topic_id: topic.topic_id },
        );
    }
  }
  await validateKnowledgeHierarchy({ ...input, idsByClientKey });
  if (input.patch.overview_brief)
    await validateKnowledgeInsightBriefReferences({
      wikiId: input.wikiId,
      brief: input.patch.overview_brief,
      pendingPageTitles: input.pendingPageTitles,
    });
  const topicBriefIds = new Set<string>();
  for (const topicBrief of input.patch.topic_briefs ?? []) {
    const topic = await resolveKnowledgeTopicReference(
      input.wikiId,
      topicBrief.topic,
      idsByClientKey,
    );
    if (topicBriefIds.has(topic.id))
      throw new AppError(
        "validation_error",
        "A knowledge map patch cannot replace the same topic brief twice.",
        400,
        { topic_id: topic.id },
      );
    topicBriefIds.add(topic.id);
    if (topicBrief.brief)
      await validateKnowledgeInsightBriefReferences({
        wikiId: input.wikiId,
        brief: topicBrief.brief,
        pendingPageTitles: input.pendingPageTitles,
      });
  }
  for (const placement of input.patch.placements) {
    const topic = await resolveKnowledgeTopicReference(
        input.wikiId,
        placement.topic,
        idsByClientKey,
      ),
      page =
        placement.page.title &&
        input.pendingPageTitles?.has(titleKey(placement.page.title))
          ? null
          : await resolvePageReference(input.wikiId, placement.page),
      current = placement.placement_id
        ? await db()
            .prepare(
              `SELECT page_id,is_locked FROM knowledge_placements WHERE id=? AND wiki_id=? AND deleted_at IS NULL`,
            )
            .bind(placement.placement_id, input.wikiId)
            .first<{ page_id: string; is_locked: number }>()
        : page
          ? await db()
              .prepare(
                `SELECT page_id,is_locked FROM knowledge_placements WHERE wiki_id=? AND topic_id=? AND page_id=? AND deleted_at IS NULL`,
              )
              .bind(input.wikiId, topic.id, page.id)
              .first<{ page_id: string; is_locked: number }>()
          : null;
    if (placement.placement_id && !current)
      throw new AppError(
        "not_found",
        "The knowledge placement was not found.",
        404,
        { placement_id: placement.placement_id },
      );
    if (current?.is_locked && !input.allowLocked)
      throw new AppError(
        "version_conflict",
        "A user-locked knowledge placement cannot be changed by an LLM plan.",
        409,
        { placement_id: placement.placement_id },
      );
  }
  for (const placementId of input.patch.remove_placement_ids) {
    const placement = await db()
      .prepare(
        `SELECT is_locked FROM knowledge_placements WHERE id=? AND wiki_id=? AND deleted_at IS NULL`,
      )
      .bind(placementId, input.wikiId)
      .first<{ is_locked: number }>();
    if (!placement)
      throw new AppError(
        "not_found",
        "The knowledge placement was not found.",
        404,
        { placement_id: placementId },
      );
    if (placement.is_locked && !input.allowLocked)
      throw new AppError(
        "version_conflict",
        "A user-locked knowledge placement cannot be removed by an LLM plan.",
        409,
        { placement_id: placementId },
      );
  }
  return { version, idsByClientKey };
}

export async function applyKnowledgeMapPatch(input: {
  wikiId: string;
  email: string;
  patch: KnowledgeMapPatch;
  requestId: string;
  origin: "human" | "webmcp";
  pageState?: IngestActionState;
  manual?: boolean;
  operationId?: string;
}) {
  const d = db(),
    replay = input.operationId
      ? await d
          .prepare(
            `SELECT version FROM knowledge_maps WHERE wiki_id=? AND last_operation_id=?`,
          )
          .bind(input.wikiId, input.operationId)
          .first<{ version: number }>()
      : null;
  if (replay)
    return {
      wiki_id: input.wikiId,
      version: Number(replay.version),
      topic_ids_by_client_key: {},
      placement_ids: [],
      replayed: true,
      change_set: {
        pages_changed: [],
        tree_changed: false,
        links_changed: false,
        search_changed: false,
        graph_changed: false,
        knowledge_changed: true,
      } satisfies ChangeSet,
    };
  const validation = await validateKnowledgeMapPatch({
      wikiId: input.wikiId,
      patch: input.patch,
      allowLocked: input.manual,
    }),
    timestamp = now(),
    idsByClientKey = validation.idsByClientKey,
    topicStatements: D1PreparedStatement[] = [];
  const hasOverviewBrief = Object.prototype.hasOwnProperty.call(
      input.patch,
      "overview_brief",
    ),
    resolvedOverviewBrief = input.patch.overview_brief
      ? await resolveKnowledgeInsightBrief(
          input.wikiId,
          input.patch.overview_brief,
          input.pageState,
        )
      : null,
    resolvedTopicBriefs = await Promise.all(
      (input.patch.topic_briefs ?? []).map(async (item) => ({
        topicId: (
          await resolveKnowledgeTopicReference(
            input.wikiId,
            item.topic,
            idsByClientKey,
          )
        ).id,
        brief: item.brief
          ? await resolveKnowledgeInsightBrief(
              input.wikiId,
              item.brief,
              input.pageState,
            )
          : null,
      })),
    );
  for (const topic of input.patch.topics) {
    const topicId = idsByClientKey.get(topic.client_key)!,
      parentId = topic.parent
        ? (
            await resolveKnowledgeTopicReference(
              input.wikiId,
              topic.parent,
              idsByClientKey,
            )
          ).id
        : null,
      current = topic.topic_id
        ? await d
            .prepare(
              `SELECT id FROM knowledge_topics WHERE id=? AND wiki_id=? AND deleted_at IS NULL`,
            )
            .bind(topic.topic_id, input.wikiId)
            .first<{ id: string }>()
        : null;
    topicStatements.push(
      current
        ? d
            .prepare(
              `UPDATE knowledge_topics SET parent_topic_id=?,title=?,summary=?,presentation=?,sort_order=?,is_locked=CASE WHEN ? THEN 1 ELSE is_locked END,updated_by=?,updated_at=? WHERE id=? AND wiki_id=? AND deleted_at IS NULL`,
            )
            .bind(
              parentId,
              topic.title,
              topic.summary,
              topic.presentation,
              topic.sort_order,
              input.manual ? 1 : 0,
              input.email,
              timestamp,
              topicId,
              input.wikiId,
            )
        : d
            .prepare(
              `INSERT INTO knowledge_topics(id,wiki_id,parent_topic_id,title,summary,presentation,sort_order,is_locked,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
            )
            .bind(
              topicId,
              input.wikiId,
              parentId,
              topic.title,
              topic.summary,
              topic.presentation,
              topic.sort_order,
              input.manual ? 1 : 0,
              input.email,
              input.email,
              timestamp,
              timestamp,
            ),
    );
  }

  const removalIds = new Set(input.patch.remove_placement_ids),
    placementStatements: D1PreparedStatement[] = [];
  const removedPlacements: Array<{
    id: string;
    page_id: string;
  }> = [];
  for (const placementId of removalIds) {
    const removed = await d
      .prepare(
        `SELECT id,page_id FROM knowledge_placements WHERE id=? AND wiki_id=? AND deleted_at IS NULL`,
      )
      .bind(placementId, input.wikiId)
      .first<{ id: string; page_id: string }>();
    if (removed) removedPlacements.push(removed);
    placementStatements.push(
      d
        .prepare(
          `UPDATE knowledge_placements SET deleted_at=?,updated_by=?,updated_at=? WHERE id=? AND wiki_id=? AND deleted_at IS NULL`,
        )
        .bind(timestamp, input.email, timestamp, placementId, input.wikiId),
    );
  }

  const resolvedDrafts: Array<{
    id: string;
    topicId: string;
    pageId: string;
    pageType: PageType;
    role: KnowledgePlacementRole;
    summary: string;
    sortOrder: number;
    existingLocked: boolean;
  }> = [];
  for (const placement of input.patch.placements) {
    if (!KNOWLEDGE_PLACEMENT_ROLES.includes(placement.role))
      throw new AppError(
        "validation_error",
        "Knowledge placement role is not supported.",
        400,
        { role: placement.role },
      );
    const topic = await resolveKnowledgeTopicReference(
        input.wikiId,
        placement.topic,
        idsByClientKey,
      ),
      page = await resolvePageReference(
        input.wikiId,
        placement.page,
        input.pageState,
      ),
      existing = placement.placement_id
        ? await d
            .prepare(
              `SELECT id,is_locked FROM knowledge_placements WHERE id=? AND wiki_id=? AND deleted_at IS NULL`,
            )
            .bind(placement.placement_id, input.wikiId)
            .first<{ id: string; is_locked: number }>()
        : await d
            .prepare(
              `SELECT id,is_locked FROM knowledge_placements WHERE wiki_id=? AND topic_id=? AND page_id=? AND deleted_at IS NULL`,
            )
            .bind(input.wikiId, topic.id, page.id)
            .first<{ id: string; is_locked: number }>();
    if (existing?.is_locked && !input.manual)
      throw new AppError(
        "version_conflict",
        "A user-locked knowledge placement cannot be changed by an LLM plan.",
        409,
        { placement_id: existing.id },
      );
    if (placement.placement_id) {
      const duplicate = await d
        .prepare(
          `SELECT id FROM knowledge_placements WHERE wiki_id=? AND topic_id=? AND page_id=? AND id<>? AND deleted_at IS NULL`,
        )
        .bind(input.wikiId, topic.id, page.id, placement.placement_id)
        .first<{ id: string }>();
      if (duplicate)
        throw new AppError(
          "validation_error",
          "A page cannot be placed twice in the same knowledge topic.",
          400,
          { placement_id: placement.placement_id, duplicate_id: duplicate.id },
        );
    }
    resolvedDrafts.push({
      id: existing?.id ?? placement.placement_id ?? uuid(),
      topicId: topic.id,
      pageId: page.id,
      pageType: page.page_type,
      role: placement.role,
      summary: placement.summary,
      sortOrder: placement.sort_order,
      existingLocked: Boolean(existing?.is_locked),
    });
  }

  const touchedPageIds = [
    ...new Set([
      ...resolvedDrafts.map((item) => item.pageId),
      ...removedPlacements.map((item) => item.page_id),
    ]),
  ];
  for (const pageId of touchedPageIds) {
    const existing = await d
        .prepare(
          `SELECT id,role FROM knowledge_placements WHERE wiki_id=? AND page_id=? AND deleted_at IS NULL`,
        )
        .bind(input.wikiId, pageId)
        .all<{ id: string; role: KnowledgePlacementRole }>(),
      rolesById = new Map(
        existing.results
          .filter((item) => !removalIds.has(item.id))
          .map((item) => [item.id, item.role]),
      );
    for (const draft of resolvedDrafts.filter((item) => item.pageId === pageId))
      rolesById.set(draft.id, draft.role);
    if (rolesById.size > 3)
      throw new AppError(
        "validation_error",
        "A page can have at most three active knowledge placements.",
        400,
        { page_id: pageId },
      );
    const primaryCount = [...rolesById.values()].filter(
      (role) => role === "primary",
    ).length;
    const pageType =
      resolvedDrafts.find((item) => item.pageId === pageId)?.pageType ??
      (
        await d
          .prepare(
            `SELECT page_type FROM pages WHERE id=? AND wiki_id=? AND deleted_at IS NULL`,
          )
          .bind(pageId, input.wikiId)
          .first<{ page_type: PageType }>()
      )?.page_type;
    if (
      primaryCount > 1 ||
      (rolesById.size > 0 && pageType !== "source" && primaryCount !== 1)
    )
      throw new AppError(
        "validation_error",
        "A mapped non-source page must have exactly one primary placement.",
        400,
        { page_id: pageId, primary_count: primaryCount },
      );
  }

  for (const placement of resolvedDrafts)
    placementStatements.push(
      d
        .prepare(
          `INSERT INTO knowledge_placements(id,wiki_id,topic_id,page_id,role,summary,sort_order,is_locked,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET topic_id=excluded.topic_id,page_id=excluded.page_id,role=excluded.role,summary=excluded.summary,sort_order=excluded.sort_order,is_locked=CASE WHEN ? THEN 1 ELSE knowledge_placements.is_locked END,updated_by=excluded.updated_by,updated_at=excluded.updated_at,deleted_at=NULL`,
        )
        .bind(
          placement.id,
          input.wikiId,
          placement.topicId,
          placement.pageId,
          placement.role,
          placement.summary,
          placement.sortOrder,
          input.manual ? 1 : placement.existingLocked ? 1 : 0,
          input.email,
          input.email,
          timestamp,
          timestamp,
          input.manual ? 1 : 0,
        ),
    );

  await d
    .prepare(
      `INSERT OR IGNORE INTO knowledge_maps(wiki_id,version,updated_by,updated_at,last_operation_id) VALUES(?,0,?,?,NULL)`,
    )
    .bind(input.wikiId, input.email, timestamp)
    .run();
  const results = await d.batch([
    d
      .prepare(
        `INSERT INTO knowledge_maps(wiki_id,version,updated_by,updated_at,last_operation_id) SELECT wiki_id,version,updated_by,updated_at,last_operation_id FROM knowledge_maps WHERE wiki_id=? AND version<>?`,
      )
      .bind(input.wikiId, input.patch.expected_version),
    d
      .prepare(
        `UPDATE knowledge_maps SET version=version+1,updated_by=?,updated_at=?,last_operation_id=COALESCE(?,last_operation_id) WHERE wiki_id=? AND version=?`,
      )
      .bind(
        input.email,
        timestamp,
        input.operationId ?? null,
        input.wikiId,
        input.patch.expected_version,
      ),
    ...topicStatements,
    ...placementStatements,
    d
      .prepare(
        `INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) VALUES(?,?,?,?, 'knowledge-map.update','knowledge_map',?,'success',?,?,?)`,
      )
      .bind(
        uuid(),
        input.wikiId,
        input.email,
        input.origin,
        input.wikiId,
        input.requestId,
        JSON.stringify({
          topic_count: input.patch.topics.length,
          placement_count: input.patch.placements.length,
          removal_count: input.patch.remove_placement_ids.length,
          overview_brief_changed: hasOverviewBrief,
          topic_brief_count: resolvedTopicBriefs.length,
          manual: Boolean(input.manual),
        }),
        timestamp,
      ),
  ]);
  if (Number(results[1].meta.changes ?? 0) !== 1)
    throw new AppError(
      "version_conflict",
      "The knowledge map changed while the update was being applied.",
      409,
      { expected_version: input.patch.expected_version },
    );
  const briefStatements: D1PreparedStatement[] = [];
  if (hasOverviewBrief) {
    const basisHash = resolvedOverviewBrief
      ? await knowledgeInsightBasisHash({
          wikiId: input.wikiId,
          topicId: null,
          brief: resolvedOverviewBrief,
        })
      : null;
    briefStatements.push(
      d
        .prepare(
          `UPDATE knowledge_maps SET overview_brief_json=?,overview_brief_basis_hash=? WHERE wiki_id=?`,
        )
        .bind(
          resolvedOverviewBrief ? stableJson(resolvedOverviewBrief) : null,
          basisHash,
          input.wikiId,
        ),
    );
  }
  for (const item of resolvedTopicBriefs) {
    const basisHash = item.brief
      ? await knowledgeInsightBasisHash({
          wikiId: input.wikiId,
          topicId: item.topicId,
          brief: item.brief,
        })
      : null;
    briefStatements.push(
      d
        .prepare(
          `UPDATE knowledge_topics SET insight_brief_json=?,insight_brief_basis_hash=?,updated_by=?,updated_at=? WHERE id=? AND wiki_id=? AND deleted_at IS NULL`,
        )
        .bind(
          item.brief ? stableJson(item.brief) : null,
          basisHash,
          input.email,
          timestamp,
          item.topicId,
          input.wikiId,
        ),
    );
  }
  if (briefStatements.length) await d.batch(briefStatements);
  return {
    wiki_id: input.wikiId,
    version: input.patch.expected_version + 1,
    topic_ids_by_client_key: Object.fromEntries(idsByClientKey),
    placement_ids: resolvedDrafts.map((item) => item.id),
    replayed: false,
    change_set: {
      pages_changed: [],
      tree_changed: false,
      links_changed: false,
      search_changed: false,
      graph_changed: false,
      knowledge_changed: true,
    } satisfies ChangeSet,
  };
}

export async function setKnowledgeTopicLock(input: {
  wikiId: string;
  email: string;
  topicId: string;
  expectedVersion: number;
  locked: boolean;
  requestId: string;
}) {
  const d = db(),
    topic = await d
      .prepare(
        `SELECT id FROM knowledge_topics WHERE id=? AND wiki_id=? AND deleted_at IS NULL`,
      )
      .bind(input.topicId, input.wikiId)
      .first<{ id: string }>();
  if (!topic)
    throw new AppError("not_found", "The knowledge topic was not found.", 404, {
      topic_id: input.topicId,
    });
  const version = await currentKnowledgeMapVersion(input.wikiId);
  if (version !== input.expectedVersion)
    throw new AppError(
      "version_conflict",
      "The knowledge map changed after it was read.",
      409,
      { expected_version: input.expectedVersion, actual_version: version },
    );
  const timestamp = now();
  await d.batch([
    d
      .prepare(
        `INSERT INTO knowledge_maps(wiki_id,version,updated_by,updated_at,last_operation_id) SELECT wiki_id,version,updated_by,updated_at,last_operation_id FROM knowledge_maps WHERE wiki_id=? AND version<>?`,
      )
      .bind(input.wikiId, input.expectedVersion),
    d
      .prepare(
        `UPDATE knowledge_maps SET version=version+1,updated_by=?,updated_at=? WHERE wiki_id=? AND version=?`,
      )
      .bind(input.email, timestamp, input.wikiId, input.expectedVersion),
    d
      .prepare(
        `UPDATE knowledge_topics SET is_locked=?,updated_by=?,updated_at=? WHERE id=? AND wiki_id=? AND deleted_at IS NULL`,
      )
      .bind(
        input.locked ? 1 : 0,
        input.email,
        timestamp,
        input.topicId,
        input.wikiId,
      ),
    d
      .prepare(
        `INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) VALUES(?,?,?,'human','knowledge-topic.lock','knowledge_topic',?,'success',?,?,?)`,
      )
      .bind(
        uuid(),
        input.wikiId,
        input.email,
        input.topicId,
        input.requestId,
        JSON.stringify({ locked: input.locked }),
        timestamp,
      ),
  ]);
  return {
    topic_id: input.topicId,
    is_locked: input.locked,
    version: input.expectedVersion + 1,
    change_set: {
      pages_changed: [],
      tree_changed: false,
      links_changed: false,
      search_changed: false,
      graph_changed: false,
      knowledge_changed: true,
    } satisfies ChangeSet,
  };
}

export async function createKnowledgeMapPlan(input: {
  wikiId: string;
  email: string;
  patch: KnowledgeMapPatch;
  requestId: string;
  origin: "human" | "webmcp";
}) {
  await validateKnowledgeMapPatch({ wikiId: input.wikiId, patch: input.patch });
  const planId = uuid(),
    planHash = await canonicalIngestPlanHash(input.patch),
    createdAt = now(),
    expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await db()
    .prepare(
      `INSERT INTO knowledge_map_plans(id,wiki_id,actor_email,status,patch_json,plan_hash,created_at,expires_at) VALUES(?,?,?,'planned',?,?,?,?)`,
    )
    .bind(
      planId,
      input.wikiId,
      input.email,
      stableJson(input.patch),
      planHash,
      createdAt,
      expiresAt,
    )
    .run();
  return {
    plan_id: planId,
    plan_hash: planHash,
    status: "planned",
    expected_version: input.patch.expected_version,
    topic_count: input.patch.topics.length,
    placement_count: input.patch.placements.length,
    removal_count: input.patch.remove_placement_ids.length,
    overview_brief_changed: Object.prototype.hasOwnProperty.call(
      input.patch,
      "overview_brief",
    ),
    topic_brief_count: input.patch.topic_briefs?.length ?? 0,
    expires_at: expiresAt,
  };
}

export async function applyKnowledgeMapPlan(input: {
  wikiId: string;
  email: string;
  planId: string;
  planHash: string;
  approved: boolean;
  operationId: string;
  requestId: string;
  origin: "human" | "webmcp";
}) {
  if (!input.approved)
    throw new AppError(
      "validation_error",
      "approved must be true before a knowledge map plan can be applied.",
      400,
      { field: "approved" },
    );
  const row = await db()
    .prepare(
      `SELECT status,patch_json,plan_hash,apply_operation_id,expires_at,applied_at FROM knowledge_map_plans WHERE id=? AND wiki_id=? AND actor_email=?`,
    )
    .bind(input.planId, input.wikiId, input.email)
    .first<{
      status: string;
      patch_json: string;
      plan_hash: string;
      apply_operation_id: string | null;
      expires_at: string;
      applied_at: string | null;
    }>();
  if (!row)
    throw new AppError(
      "not_found",
      "The knowledge map plan was not found.",
      404,
      { plan_id: input.planId },
    );
  if (row.plan_hash !== input.planHash)
    throw new AppError(
      "validation_error",
      "The knowledge map plan hash does not match the persisted plan.",
      409,
      { plan_id: input.planId },
    );
  if (row.status === "applied")
    return {
      plan_id: input.planId,
      plan_hash: input.planHash,
      status: "applied",
      applied_at: row.applied_at,
      replayed: true,
    };
  if (row.expires_at <= now())
    throw new AppError(
      "validation_error",
      "The knowledge map plan has expired.",
      409,
      { plan_id: input.planId },
    );
  if (row.apply_operation_id && row.apply_operation_id !== input.operationId)
    throw new AppError(
      "idempotency_pending",
      "Retry this plan with its original operation_id.",
      409,
      { plan_id: input.planId },
      true,
    );
  await db()
    .prepare(
      `UPDATE knowledge_map_plans SET status='applying',apply_operation_id=? WHERE id=?`,
    )
    .bind(input.operationId, input.planId)
    .run();
  const result = await applyKnowledgeMapPatch({
    wikiId: input.wikiId,
    email: input.email,
    patch: JSON.parse(row.patch_json) as KnowledgeMapPatch,
    requestId: input.requestId,
    origin: input.origin,
    operationId: input.operationId,
  });
  const appliedAt = now();
  await db()
    .prepare(
      `UPDATE knowledge_map_plans SET status='applied',applied_at=? WHERE id=?`,
    )
    .bind(appliedAt, input.planId)
    .run();
  return {
    plan_id: input.planId,
    plan_hash: input.planHash,
    status: "applied",
    applied_at: appliedAt,
    version: result.version,
    replayed: false,
    change_set: result.change_set,
  };
}
