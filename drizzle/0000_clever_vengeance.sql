CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`wiki_id` text NOT NULL,
	`page_id` text,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`uploaded_by` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_object_key_unique` ON `attachments` (`object_key`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`wiki_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`origin` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`outcome` text NOT NULL,
	`request_id` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_events_wiki_recent` ON `audit_events` (`wiki_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `backup_revision_coverage` (
	`backup_run_id` text NOT NULL,
	`revision_id` text NOT NULL,
	PRIMARY KEY(`backup_run_id`, `revision_id`)
);
--> statement-breakpoint
CREATE TABLE `backup_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`wiki_id` text NOT NULL,
	`profile` text NOT NULL,
	`status` text NOT NULL,
	`manifest_hash` text,
	`part_count` integer DEFAULT 0 NOT NULL,
	`acknowledged_at` text,
	`created_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`wiki_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`operation_id` text NOT NULL,
	`operation_name` text NOT NULL,
	`request_hash` text NOT NULL,
	`request_id` text NOT NULL,
	`status` text NOT NULL,
	`lease_expires_at` text NOT NULL,
	`failure_retryable` integer,
	`attempts` integer DEFAULT 1 NOT NULL,
	`result_json` text,
	`created_at` text NOT NULL,
	`completed_at` text,
	`expires_at` text NOT NULL,
	PRIMARY KEY(`wiki_id`, `actor_email`, `operation_name`, `operation_id`)
);
--> statement-breakpoint
CREATE TABLE `import_batches` (
	`session_id` text NOT NULL,
	`batch_index` integer NOT NULL,
	`expected_hash` text NOT NULL,
	`received_hash` text,
	`status` text NOT NULL,
	`item_count` integer DEFAULT 0 NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`completed_at` text,
	PRIMARY KEY(`session_id`, `batch_index`)
);
--> statement-breakpoint
CREATE TABLE `import_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_email` text NOT NULL,
	`manifest_hash` text NOT NULL,
	`status` text NOT NULL,
	`staging_wiki_id` text NOT NULL,
	`completed_batches` integer DEFAULT 0 NOT NULL,
	`total_batches` integer NOT NULL,
	`error_summary` text,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `page_links` (
	`id` text PRIMARY KEY NOT NULL,
	`wiki_id` text NOT NULL,
	`source_page_id` text NOT NULL,
	`target_page_id` text,
	`target_text` text NOT NULL,
	`link_kind` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_page_links_source` ON `page_links` (`wiki_id`,`source_page_id`);--> statement-breakpoint
CREATE INDEX `idx_page_links_target` ON `page_links` (`wiki_id`,`target_page_id`);--> statement-breakpoint
CREATE TABLE `page_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`version` integer NOT NULL,
	`snapshot_inline` text,
	`snapshot_object_key` text,
	`content_sha256` text NOT NULL,
	`frontmatter_json` text DEFAULT '{}' NOT NULL,
	`change_summary` text,
	`actor_email` text NOT NULL,
	`origin` text NOT NULL,
	`save_kind` text NOT NULL,
	`operation_id` text,
	`status` text DEFAULT 'ready' NOT NULL,
	`is_pinned` integer DEFAULT 0 NOT NULL,
	`pinned_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_page_revisions_version` ON `page_revisions` (`page_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_page_revisions_recent` ON `page_revisions` (`page_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `pages` (
	`id` text PRIMARY KEY NOT NULL,
	`wiki_id` text NOT NULL,
	`parent_id` text,
	`parent_key` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`page_type` text NOT NULL,
	`markdown` text NOT NULL,
	`frontmatter_json` text DEFAULT '{}' NOT NULL,
	`version` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`last_operation_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`wiki_id`) REFERENCES `wikis`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_pages_sibling_slug` ON `pages` (`wiki_id`,`parent_key`,`slug`);--> statement-breakpoint
CREATE INDEX `idx_pages_wiki_parent` ON `pages` (`wiki_id`,`parent_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_pages_wiki_updated` ON `pages` (`wiki_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `site_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`active_wiki_id` text,
	`bootstrap_status` text NOT NULL,
	`reserved_by` text,
	`reserved_at` text,
	`lease_expires_at` text,
	`last_error` text,
	`version` integer NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `storage_repairs` (
	`id` text PRIMARY KEY NOT NULL,
	`wiki_id` text,
	`object_key` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wiki_members` (
	`wiki_id` text NOT NULL,
	`user_email` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`wiki_id`, `user_email`),
	FOREIGN KEY (`wiki_id`) REFERENCES `wikis`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_wiki_members_email` ON `wiki_members` (`user_email`);--> statement-breakpoint
CREATE TABLE `wiki_usage` (
	`wiki_id` text PRIMARY KEY NOT NULL,
	`page_bytes` integer DEFAULT 0 NOT NULL,
	`revision_inline_bytes` integer DEFAULT 0 NOT NULL,
	`r2_ready_revision_bytes` integer DEFAULT 0 NOT NULL,
	`r2_ready_attachment_bytes` integer DEFAULT 0 NOT NULL,
	`r2_soft_deleted_bytes` integer DEFAULT 0 NOT NULL,
	`r2_pending_bytes` integer DEFAULT 0 NOT NULL,
	`r2_staging_import_bytes` integer DEFAULT 0 NOT NULL,
	`r2_orphan_estimate_bytes` integer DEFAULT 0 NOT NULL,
	`page_count` integer DEFAULT 0 NOT NULL,
	`revision_count` integer DEFAULT 0 NOT NULL,
	`attachment_count` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wikis` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wikis_slug_unique` ON `wikis` (`slug`);