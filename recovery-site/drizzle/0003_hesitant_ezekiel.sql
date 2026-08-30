CREATE TABLE `webmcp_tool_metrics` (
	`wiki_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`outcome` text NOT NULL,
	`invocation_count` integer DEFAULT 0 NOT NULL,
	`total_latency_ms` integer DEFAULT 0 NOT NULL,
	`max_latency_ms` integer DEFAULT 0 NOT NULL,
	`last_latency_ms` integer DEFAULT 0 NOT NULL,
	`last_correlation_id` text NOT NULL,
	`last_invoked_at` text NOT NULL,
	PRIMARY KEY(`wiki_id`, `tool_name`, `outcome`)
);
