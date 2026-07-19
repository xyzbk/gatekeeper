ALTER TABLE `review_runs` ADD `target_key` text NOT NULL DEFAULT '';
--> statement-breakpoint
DROP INDEX `review_runs_repository_target_idx`;
--> statement-breakpoint
CREATE INDEX `review_runs_repository_target_key_idx` ON `review_runs` (`repository_id`,`target_key`,`created_at`);
