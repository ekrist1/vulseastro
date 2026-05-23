ALTER TABLE `vulse_entries` ADD COLUMN `parent_id` text REFERENCES `vulse_entries`(`id`) ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE `vulse_entries` ADD COLUMN `sort_order` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `vulse_entries` ADD COLUMN `draft_content` text;
--> statement-breakpoint
CREATE INDEX `vulse_entries_tree` ON `vulse_entries` (`collection`,`parent_id`,`sort_order`);
