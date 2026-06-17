DROP INDEX `media_shopify_id_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `media_entity_shopify_idx` ON `media` (`entity_type`,`entity_id`,`shopify_id`);