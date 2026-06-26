ALTER TABLE `product` ADD `handle` text;--> statement-breakpoint
CREATE UNIQUE INDEX `product_handle_unique` ON `product` (`handle`);