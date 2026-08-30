CREATE TABLE `ingest_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`wiki_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`status` text NOT NULL,
	`plan_json` text NOT NULL,
	`plan_hash` text NOT NULL,
	`action_state_json` text DEFAULT '{}' NOT NULL,
	`apply_operation_id` text,
	`failure_code` text,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`applied_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_ingest_plans_owner` ON `ingest_plans` (`wiki_id`,`actor_email`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `knowledge_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`wiki_id` text NOT NULL,
	`subject_page_id` text NOT NULL,
	`predicate` text NOT NULL,
	`object_page_id` text,
	`object_value` text,
	`source_page_id` text NOT NULL,
	`evidence_fragment` text NOT NULL,
	`confidence` real NOT NULL,
	`observed_at` text NOT NULL,
	`valid_from` text,
	`valid_to` text,
	`supersedes_claim_id` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_knowledge_claims_subject` ON `knowledge_claims` (`wiki_id`,`subject_page_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_knowledge_claims_source` ON `knowledge_claims` (`wiki_id`,`source_page_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `wiki_operating_contracts` (
	`wiki_id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`contract_json` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_operation_id` text NOT NULL
);
