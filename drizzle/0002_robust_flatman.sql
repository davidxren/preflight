CREATE TABLE `requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`symbol` text NOT NULL,
	`action` text NOT NULL,
	`mode` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `requests_created_at_idx` ON `requests` (`created_at`);