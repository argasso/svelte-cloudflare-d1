CREATE TABLE `catalogue_request` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`address_line1` text NOT NULL,
	`address_line2` text,
	`postal_code` text NOT NULL,
	`city` text NOT NULL,
	`note` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`ip_address` text,
	`sent_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
