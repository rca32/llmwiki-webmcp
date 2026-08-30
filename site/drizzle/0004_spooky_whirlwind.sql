CREATE TABLE `api_request_metrics` (
	`command_name` text NOT NULL,
	`outcome` text NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`total_latency_ms` integer DEFAULT 0 NOT NULL,
	`max_latency_ms` integer DEFAULT 0 NOT NULL,
	`last_latency_ms` integer DEFAULT 0 NOT NULL,
	`last_request_id` text NOT NULL,
	`last_requested_at` text NOT NULL,
	PRIMARY KEY(`command_name`, `outcome`)
);
