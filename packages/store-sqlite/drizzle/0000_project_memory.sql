CREATE TABLE `commits` (
	`repository_id` text NOT NULL,
	`sha` text NOT NULL,
	`authored_at` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`indexed_at` text NOT NULL,
	PRIMARY KEY(`repository_id`, `sha`),
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `document_links` (
	`repository_id` text NOT NULL,
	`from_document_id` text NOT NULL,
	`to_document_id` text NOT NULL,
	`type` text NOT NULL,
	PRIMARY KEY(`repository_id`, `from_document_id`, `to_document_id`, `type`),
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`rowid` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`repository_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`title` text NOT NULL,
	`path` text,
	`commit_sha` text,
	`excerpt` text NOT NULL,
	`content_hash` text NOT NULL,
	`status` text NOT NULL,
	`occurred_at` text,
	`chunk_index` integer NOT NULL,
	`indexed_at` text NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_id_unique` ON `documents` (`id`);--> statement-breakpoint
CREATE INDEX `documents_repository_path_idx` ON `documents` (`repository_id`,`path`);--> statement-breakpoint
CREATE INDEX `documents_repository_source_idx` ON `documents` (`repository_id`,`source_type`,`source_id`);--> statement-breakpoint
CREATE TABLE `files` (
	`repository_id` text NOT NULL,
	`path` text NOT NULL,
	`object_id` text NOT NULL,
	`mode` text NOT NULL,
	`size_bytes` integer,
	`indexed_at` text NOT NULL,
	PRIMARY KEY(`repository_id`, `path`),
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `finding_evidence` (
	`review_id` text NOT NULL,
	`finding_id` text NOT NULL,
	`position` integer NOT NULL,
	`evidence_json` text NOT NULL,
	PRIMARY KEY(`review_id`, `finding_id`, `position`),
	FOREIGN KEY (`review_id`,`finding_id`) REFERENCES `findings`(`review_id`,`finding_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `findings` (
	`review_id` text NOT NULL,
	`finding_id` text NOT NULL,
	`authority` text NOT NULL,
	`severity` text NOT NULL,
	`category` text NOT NULL,
	`finding_json` text NOT NULL,
	PRIMARY KEY(`review_id`, `finding_id`),
	FOREIGN KEY (`review_id`) REFERENCES `review_runs`(`review_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `index_state` (
	`repository_id` text PRIMARY KEY NOT NULL,
	`head` text NOT NULL,
	`indexed_at` text NOT NULL,
	`file_count` integer NOT NULL,
	`document_count` integer NOT NULL,
	`commit_count` integer NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `repositories` (
	`id` text PRIMARY KEY NOT NULL,
	`root` text NOT NULL,
	`normalized_root` text NOT NULL,
	`remote` text,
	`normalized_remote` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repositories_normalized_root_unique` ON `repositories` (`normalized_root`);--> statement-breakpoint
CREATE UNIQUE INDEX `repositories_normalized_remote_unique` ON `repositories` (`normalized_remote`);--> statement-breakpoint
CREATE TABLE `review_runs` (
	`review_id` text PRIMARY KEY NOT NULL,
	`repository_id` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_display` text NOT NULL,
	`verdict` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` text NOT NULL,
	`previous_review_id` text,
	`review_json` text NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `review_runs_repository_target_idx` ON `review_runs` (`repository_id`,`target_kind`,`target_display`,`created_at`);
--> statement-breakpoint
CREATE VIRTUAL TABLE `document_fts` USING fts5(
	`title`,
	`excerpt`,
	`source_id`,
	`path`,
	content='documents',
	content_rowid='rowid',
	tokenize='unicode61'
);
--> statement-breakpoint
CREATE TRIGGER `document_fts_ai` AFTER INSERT ON `documents` BEGIN
	INSERT INTO `document_fts` (`rowid`, `title`, `excerpt`, `source_id`, `path`)
	VALUES (new.`rowid`, new.`title`, new.`excerpt`, new.`source_id`, new.`path`);
END;
--> statement-breakpoint
CREATE TRIGGER `document_fts_ad` AFTER DELETE ON `documents` BEGIN
	INSERT INTO `document_fts` (`document_fts`, `rowid`, `title`, `excerpt`, `source_id`, `path`)
	VALUES ('delete', old.`rowid`, old.`title`, old.`excerpt`, old.`source_id`, old.`path`);
END;
--> statement-breakpoint
CREATE TRIGGER `document_fts_au` AFTER UPDATE ON `documents` BEGIN
	INSERT INTO `document_fts` (`document_fts`, `rowid`, `title`, `excerpt`, `source_id`, `path`)
	VALUES ('delete', old.`rowid`, old.`title`, old.`excerpt`, old.`source_id`, old.`path`);
	INSERT INTO `document_fts` (`rowid`, `title`, `excerpt`, `source_id`, `path`)
	VALUES (new.`rowid`, new.`title`, new.`excerpt`, new.`source_id`, new.`path`);
END;
