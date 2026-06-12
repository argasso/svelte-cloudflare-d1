CREATE TABLE `product` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shopify_id` text,
	`stripe_id` text,
	`title` text NOT NULL,
	`description` text,
	`description_short` text,
	`price` real,
	`price_compare` real,
	`price_currency` text DEFAULT 'SEK',
	`sku` text,
	`isbn` text,
	`status` text DEFAULT 'Draft' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_shopify_id_unique` ON `product` (`shopify_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_stripe_id_unique` ON `product` (`stripe_id`);--> statement-breakpoint
CREATE TABLE `variant` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` integer NOT NULL,
	`title` text NOT NULL,
	`sku` text,
	`barcode` text,
	`price` real NOT NULL,
	`compare_at_price` real,
	`option1` text,
	`option2` text,
	`option3` text,
	`inventory_item_id` text,
	`inventory_quantity` integer DEFAULT 0,
	`requires_shipping` integer DEFAULT true,
	`taxable` integer DEFAULT true,
	`weight` real,
	`weight_unit` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `metafield` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`owner_type` text NOT NULL,
	`namespace` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`type` text NOT NULL,
	`value_json` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `metaobject` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shopify_id` text,
	`handle` text NOT NULL,
	`type` text NOT NULL,
	`fields` text,
	`title` text,
	`parent_id` integer,
	`position` integer DEFAULT 0,
	`status` text DEFAULT 'Active' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `metaobject`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `metaobject_shopify_id_unique` ON `metaobject` (`shopify_id`);--> statement-breakpoint
CREATE TABLE `products_to_metaobjects` (
	`product_id` integer NOT NULL,
	`metaobject_id` integer NOT NULL,
	`relation_type` text DEFAULT 'category',
	`position` integer DEFAULT 0,
	PRIMARY KEY(`product_id`, `metaobject_id`),
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`metaobject_id`) REFERENCES `metaobject`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shopify_id` text,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`media_type` text NOT NULL,
	`r2_key` text,
	`shopify_url` text,
	`alt_text` text,
	`width` integer,
	`height` integer,
	`file_size` integer,
	`mime_type` text,
	`position` integer DEFAULT 0,
	`migrated_to_r2` integer DEFAULT false,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_shopify_id_unique` ON `media` (`shopify_id`);--> statement-breakpoint
CREATE TABLE `sync_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`direction` text NOT NULL,
	`status` text NOT NULL,
	`error_message` text,
	`payload` text,
	`timestamp` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
