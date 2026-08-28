CREATE TABLE `predictions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`visitor_id` text NOT NULL,
	`symbol` text NOT NULL,
	`direction` text NOT NULL,
	`confidence` real NOT NULL,
	`resolve_after` text NOT NULL,
	`base_close` real NOT NULL,
	`outcome` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `predictions_visitor_idx` ON `predictions` (`visitor_id`);