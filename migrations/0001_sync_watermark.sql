ALTER TABLE `product` ADD `shopify_updated_at` text;--> statement-breakpoint
ALTER TABLE `product` ADD `last_synced_at` text;--> statement-breakpoint
ALTER TABLE `variant` ADD `shopify_updated_at` text;--> statement-breakpoint
ALTER TABLE `variant` ADD `last_synced_at` text;--> statement-breakpoint
ALTER TABLE `metaobject` ADD `shopify_updated_at` text;--> statement-breakpoint
ALTER TABLE `metaobject` ADD `last_synced_at` text;