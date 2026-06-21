ALTER TABLE `order` ADD `stripe_refund_id` text;--> statement-breakpoint
ALTER TABLE `order` ADD `refunded_amount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `order` ADD `refunded_at` text;