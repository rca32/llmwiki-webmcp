import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const wikis = sqliteTable("wikis", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
});
export const wikiMembers = sqliteTable(
  "wiki_members",
  {
    wikiId: text("wiki_id")
      .notNull()
      .references(() => wikis.id),
    userEmail: text("user_email").notNull(),
    role: text("role").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.wikiId, t.userEmail] }),
    index("idx_wiki_members_email").on(t.userEmail),
  ],
);
export const wikiUserPreferences = sqliteTable("wiki_user_preferences", {
  userEmail: text("user_email").primaryKey(),
  activeWikiId: text("active_wiki_id")
    .notNull()
    .references(() => wikis.id),
  updatedAt: text("updated_at").notNull(),
});
export const pages = sqliteTable(
  "pages",
  {
    id: text("id").primaryKey(),
    wikiId: text("wiki_id")
      .notNull()
      .references(() => wikis.id),
    parentId: text("parent_id"),
    parentKey: text("parent_key").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    pageType: text("page_type").notNull(),
    markdown: text("markdown").notNull(),
    sourceUrl: text("source_url"),
    retrievalStatus: text("retrieval_status"),
    retrievedAt: text("retrieved_at"),
    extractionMethod: text("extraction_method"),
    confidence: real("confidence"),
    frontmatterJson: text("frontmatter_json").notNull().default("{}"),
    version: integer("version").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
    lastOperationId: text("last_operation_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (t) => [
    uniqueIndex("uq_pages_sibling_slug").on(t.wikiId, t.parentKey, t.slug),
    index("idx_pages_wiki_parent").on(t.wikiId, t.parentId, t.sortOrder),
    index("idx_pages_wiki_updated").on(t.wikiId, t.updatedAt),
  ],
);
export const pageRevisions = sqliteTable(
  "page_revisions",
  {
    id: text("id").primaryKey(),
    pageId: text("page_id")
      .notNull()
      .references(() => pages.id),
    version: integer("version").notNull(),
    snapshotInline: text("snapshot_inline"),
    snapshotObjectKey: text("snapshot_object_key"),
    contentSha256: text("content_sha256").notNull(),
    frontmatterJson: text("frontmatter_json").notNull().default("{}"),
    changeSummary: text("change_summary"),
    actorEmail: text("actor_email").notNull(),
    origin: text("origin").notNull(),
    saveKind: text("save_kind").notNull(),
    operationId: text("operation_id"),
    status: text("status").notNull().default("ready"),
    isPinned: integer("is_pinned").notNull().default(0),
    pinnedAt: text("pinned_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("uq_page_revisions_version").on(t.pageId, t.version),
    index("idx_page_revisions_recent").on(t.pageId, t.createdAt),
  ],
);
export const pageLinks = sqliteTable(
  "page_links",
  {
    id: text("id").primaryKey(),
    wikiId: text("wiki_id").notNull(),
    sourcePageId: text("source_page_id").notNull(),
    targetPageId: text("target_page_id"),
    targetText: text("target_text").notNull(),
    linkKind: text("link_kind").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("idx_page_links_source").on(t.wikiId, t.sourcePageId),
    index("idx_page_links_target").on(t.wikiId, t.targetPageId),
  ],
);
export const wikiOperatingContracts = sqliteTable("wiki_operating_contracts", {
  wikiId: text("wiki_id").primaryKey(),
  version: integer("version").notNull(),
  contractJson: text("contract_json").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
  lastOperationId: text("last_operation_id").notNull(),
});
export const ingestPlans = sqliteTable(
  "ingest_plans",
  {
    id: text("id").primaryKey(),
    wikiId: text("wiki_id").notNull(),
    actorEmail: text("actor_email").notNull(),
    status: text("status").notNull(),
    planJson: text("plan_json").notNull(),
    planHash: text("plan_hash").notNull(),
    actionStateJson: text("action_state_json").notNull().default("{}"),
    applyOperationId: text("apply_operation_id"),
    failureCode: text("failure_code"),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    appliedAt: text("applied_at"),
  },
  (t) => [
    index("idx_ingest_plans_owner").on(
      t.wikiId,
      t.actorEmail,
      t.status,
      t.createdAt,
    ),
  ],
);
export const knowledgeClaims = sqliteTable(
  "knowledge_claims",
  {
    id: text("id").primaryKey(),
    wikiId: text("wiki_id").notNull(),
    subjectPageId: text("subject_page_id").notNull(),
    predicate: text("predicate").notNull(),
    objectPageId: text("object_page_id"),
    objectValue: text("object_value"),
    sourcePageId: text("source_page_id").notNull(),
    evidenceFragment: text("evidence_fragment").notNull(),
    confidence: real("confidence").notNull(),
    observedAt: text("observed_at").notNull(),
    validFrom: text("valid_from"),
    validTo: text("valid_to"),
    supersedesClaimId: text("supersedes_claim_id"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (t) => [
    index("idx_knowledge_claims_subject").on(
      t.wikiId,
      t.subjectPageId,
      t.createdAt,
    ),
    index("idx_knowledge_claims_source").on(
      t.wikiId,
      t.sourcePageId,
      t.createdAt,
    ),
  ],
);
export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  wikiId: text("wiki_id").notNull(),
  pageId: text("page_id"),
  objectKey: text("object_key").notNull().unique(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  deletedAt: text("deleted_at"),
});
export const idempotencyKeys = sqliteTable(
  "idempotency_keys",
  {
    wikiId: text("wiki_id").notNull(),
    actorEmail: text("actor_email").notNull(),
    operationId: text("operation_id").notNull(),
    operationName: text("operation_name").notNull(),
    requestHash: text("request_hash").notNull(),
    requestId: text("request_id").notNull(),
    status: text("status").notNull(),
    leaseExpiresAt: text("lease_expires_at").notNull(),
    failureRetryable: integer("failure_retryable"),
    attempts: integer("attempts").notNull().default(1),
    resultJson: text("result_json"),
    createdAt: text("created_at").notNull(),
    completedAt: text("completed_at"),
    expiresAt: text("expires_at").notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.wikiId, t.actorEmail, t.operationName, t.operationId],
    }),
  ],
);
export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    wikiId: text("wiki_id").notNull(),
    actorEmail: text("actor_email").notNull(),
    origin: text("origin").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    outcome: text("outcome").notNull(),
    requestId: text("request_id").notNull(),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("idx_audit_events_wiki_recent").on(t.wikiId, t.createdAt)],
);
export const webmcpToolMetrics = sqliteTable(
  "webmcp_tool_metrics",
  {
    wikiId: text("wiki_id").notNull(),
    toolName: text("tool_name").notNull(),
    outcome: text("outcome").notNull(),
    invocationCount: integer("invocation_count").notNull().default(0),
    totalLatencyMs: integer("total_latency_ms").notNull().default(0),
    maxLatencyMs: integer("max_latency_ms").notNull().default(0),
    lastLatencyMs: integer("last_latency_ms").notNull().default(0),
    lastCorrelationId: text("last_correlation_id").notNull(),
    lastInvokedAt: text("last_invoked_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.wikiId, t.toolName, t.outcome] })],
);
export const apiRequestMetrics = sqliteTable(
  "api_request_metrics",
  {
    commandName: text("command_name").notNull(),
    outcome: text("outcome").notNull(),
    requestCount: integer("request_count").notNull().default(0),
    totalLatencyMs: integer("total_latency_ms").notNull().default(0),
    maxLatencyMs: integer("max_latency_ms").notNull().default(0),
    lastLatencyMs: integer("last_latency_ms").notNull().default(0),
    lastRequestId: text("last_request_id").notNull(),
    lastRequestedAt: text("last_requested_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.commandName, t.outcome] })],
);
export const apiCommandMeasurements = sqliteTable("api_command_measurements", {
  commandName: text("command_name").primaryKey(),
  resultSampleCount: integer("result_sample_count").notNull().default(0),
  totalResultCount: integer("total_result_count").notNull().default(0),
  maxResultCount: integer("max_result_count").notNull().default(0),
  lastResultCount: integer("last_result_count").notNull().default(0),
  sizeSampleCount: integer("size_sample_count").notNull().default(0),
  totalSizeBytes: integer("total_size_bytes").notNull().default(0),
  maxSizeBytes: integer("max_size_bytes").notNull().default(0),
  lastSizeBytes: integer("last_size_bytes").notNull().default(0),
  lastMeasuredAt: text("last_measured_at").notNull(),
});
export const wikiUsage = sqliteTable("wiki_usage", {
  wikiId: text("wiki_id").primaryKey(),
  pageBytes: integer("page_bytes").notNull().default(0),
  revisionInlineBytes: integer("revision_inline_bytes").notNull().default(0),
  r2ReadyRevisionBytes: integer("r2_ready_revision_bytes").notNull().default(0),
  r2ReadyAttachmentBytes: integer("r2_ready_attachment_bytes")
    .notNull()
    .default(0),
  r2SoftDeletedBytes: integer("r2_soft_deleted_bytes").notNull().default(0),
  r2PendingBytes: integer("r2_pending_bytes").notNull().default(0),
  r2StagingImportBytes: integer("r2_staging_import_bytes").notNull().default(0),
  r2OrphanEstimateBytes: integer("r2_orphan_estimate_bytes")
    .notNull()
    .default(0),
  pageCount: integer("page_count").notNull().default(0),
  revisionCount: integer("revision_count").notNull().default(0),
  attachmentCount: integer("attachment_count").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});
export const storageRepairs = sqliteTable("storage_repairs", {
  id: text("id").primaryKey(),
  wikiId: text("wiki_id"),
  objectKey: text("object_key").notNull(),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const importSessions = sqliteTable("import_sessions", {
  id: text("id").primaryKey(),
  actorEmail: text("actor_email").notNull(),
  manifestHash: text("manifest_hash").notNull(),
  status: text("status").notNull(),
  stagingWikiId: text("staging_wiki_id").notNull(),
  completedBatches: integer("completed_batches").notNull().default(0),
  totalBatches: integer("total_batches").notNull(),
  errorSummary: text("error_summary"),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});
export const importManifests = sqliteTable("import_manifests", {
  sessionId: text("session_id").primaryKey(),
  manifestJson: text("manifest_json").notNull(),
  createdAt: text("created_at").notNull(),
});
export const importBatches = sqliteTable(
  "import_batches",
  {
    sessionId: text("session_id").notNull(),
    batchIndex: integer("batch_index").notNull(),
    expectedHash: text("expected_hash").notNull(),
    receivedHash: text("received_hash"),
    status: text("status").notNull(),
    itemCount: integer("item_count").notNull().default(0),
    sizeBytes: integer("size_bytes").notNull().default(0),
    completedAt: text("completed_at"),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.batchIndex] })],
);
export const siteState = sqliteTable("site_state", {
  id: integer("id").primaryKey(),
  activeWikiId: text("active_wiki_id"),
  bootstrapStatus: text("bootstrap_status").notNull(),
  reservedBy: text("reserved_by"),
  reservedAt: text("reserved_at"),
  leaseExpiresAt: text("lease_expires_at"),
  lastError: text("last_error"),
  version: integer("version").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const siteRuntimeSettings = sqliteTable("site_runtime_settings", {
  id: integer("id").primaryKey(),
  writeMode: text("write_mode").notNull().default("read_write"),
  reason: text("reason"),
  updatedBy: text("updated_by"),
  updatedAt: text("updated_at").notNull(),
});
export const backupRuns = sqliteTable("backup_runs", {
  id: text("id").primaryKey(),
  wikiId: text("wiki_id").notNull(),
  profile: text("profile").notNull(),
  status: text("status").notNull(),
  manifestHash: text("manifest_hash"),
  partCount: integer("part_count").notNull().default(0),
  acknowledgedAt: text("acknowledged_at"),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
});
export const backupManifests = sqliteTable("backup_manifests", {
  backupRunId: text("backup_run_id").primaryKey(),
  manifestJson: text("manifest_json").notNull(),
  createdAt: text("created_at").notNull(),
});
export const backupRevisionCoverage = sqliteTable(
  "backup_revision_coverage",
  {
    backupRunId: text("backup_run_id").notNull(),
    revisionId: text("revision_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.backupRunId, t.revisionId] })],
);
