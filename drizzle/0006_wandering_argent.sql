CREATE TABLE `wiki_user_preferences` (
	`user_email` text PRIMARY KEY NOT NULL,
	`active_wiki_id` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`active_wiki_id`) REFERENCES `wikis`(`id`) ON UPDATE no action ON DELETE no action
);
