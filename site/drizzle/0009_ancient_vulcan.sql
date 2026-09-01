CREATE TABLE `knowledge_map_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`wiki_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`status` text NOT NULL,
	`patch_json` text NOT NULL,
	`plan_hash` text NOT NULL,
	`apply_operation_id` text,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`applied_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_knowledge_map_plans_owner` ON `knowledge_map_plans` (`wiki_id`,`actor_email`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `knowledge_maps` (
	`wiki_id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `knowledge_placements` (
	`id` text PRIMARY KEY NOT NULL,
	`wiki_id` text NOT NULL,
	`topic_id` text NOT NULL,
	`page_id` text NOT NULL,
	`role` text NOT NULL,
	`summary` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_locked` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_knowledge_placements_topic_page` ON `knowledge_placements` (`wiki_id`,`topic_id`,`page_id`);--> statement-breakpoint
CREATE INDEX `idx_knowledge_placements_page` ON `knowledge_placements` (`wiki_id`,`page_id`);--> statement-breakpoint
CREATE INDEX `idx_knowledge_placements_topic` ON `knowledge_placements` (`wiki_id`,`topic_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `knowledge_topics` (
	`id` text PRIMARY KEY NOT NULL,
	`wiki_id` text NOT NULL,
	`parent_topic_id` text,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`presentation` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_locked` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_knowledge_topics_parent` ON `knowledge_topics` (`wiki_id`,`parent_topic_id`,`sort_order`);