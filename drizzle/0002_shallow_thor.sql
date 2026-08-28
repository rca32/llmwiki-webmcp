CREATE TABLE `site_runtime_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`write_mode` text DEFAULT 'read_write' NOT NULL,
	`reason` text,
	`updated_by` text,
	`updated_at` text NOT NULL
);
