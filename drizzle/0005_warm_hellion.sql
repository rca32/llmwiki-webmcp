CREATE TABLE `api_command_measurements` (
	`command_name` text PRIMARY KEY NOT NULL,
	`result_sample_count` integer DEFAULT 0 NOT NULL,
	`total_result_count` integer DEFAULT 0 NOT NULL,
	`max_result_count` integer DEFAULT 0 NOT NULL,
	`last_result_count` integer DEFAULT 0 NOT NULL,
	`size_sample_count` integer DEFAULT 0 NOT NULL,
	`total_size_bytes` integer DEFAULT 0 NOT NULL,
	`max_size_bytes` integer DEFAULT 0 NOT NULL,
	`last_size_bytes` integer DEFAULT 0 NOT NULL,
	`last_measured_at` text NOT NULL
);
