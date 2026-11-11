CREATE TABLE `policy` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`handle` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`shopify_id` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `policy_type_unique` ON `policy` (`type`);--> statement-breakpoint
CREATE UNIQUE INDEX `policy_handle_unique` ON `policy` (`handle`);