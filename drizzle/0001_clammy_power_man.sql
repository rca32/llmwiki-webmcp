CREATE TABLE `backup_manifests` (
	`backup_run_id` text PRIMARY KEY NOT NULL,
	`manifest_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `import_manifests` (
	`session_id` text PRIMARY KEY NOT NULL,
	`manifest_json` text NOT NULL,
	`created_at` text NOT NULL
);
