ALTER TABLE `documents` ADD `remote_url` text;
--> statement-breakpoint
ALTER TABLE `document_links` ADD `position` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE `sync_cursors` (
	`repository_id` text NOT NULL,
	`provider` text NOT NULL,
	`cursor` text NOT NULL,
	`synced_at` text NOT NULL,
	PRIMARY KEY(`repository_id`, `provider`),
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
