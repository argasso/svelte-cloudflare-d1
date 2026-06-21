CREATE TABLE `counter` (
	`name` text PRIMARY KEY NOT NULL,
	`value` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `order` ADD `receipt_number` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `order_receipt_number_unique` ON `order` (`receipt_number`);