CREATE TABLE `review_operations` (
	`review_id` text PRIMARY KEY NOT NULL,
	`repository_id` text NOT NULL,
	`status` text NOT NULL,
	`operation_json` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `review_operations_repository_status_idx` ON `review_operations` (`repository_id`,`status`);
