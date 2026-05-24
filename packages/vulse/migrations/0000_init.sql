CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `vulse_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`collection` text NOT NULL,
	`parent_id` text REFERENCES `vulse_entries`(`id`) ON DELETE cascade,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text
);
--> statement-breakpoint
CREATE INDEX `vulse_entries_collection` ON `vulse_entries` (`collection`);--> statement-breakpoint
CREATE INDEX `vulse_entries_tree` ON `vulse_entries` (`collection`,`parent_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `vulse_entry_locales` (
	`entry_id` text NOT NULL REFERENCES `vulse_entries`(`id`) ON DELETE cascade,
	`collection` text NOT NULL,
	`locale` text NOT NULL,
	`slug` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL CHECK (`status` IN ('draft', 'published')),
	`version` integer DEFAULT 1 NOT NULL,
	`content` text NOT NULL,
	`draft_content` text,
	`published_at` integer,
	`updated_at` integer NOT NULL,
	`updated_by` text,
	PRIMARY KEY (`entry_id`, `locale`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vulse_entry_locales_collection_locale_slug` ON `vulse_entry_locales` (`collection`,`locale`,`slug`);--> statement-breakpoint
CREATE INDEX `vulse_entry_locales_status_published` ON `vulse_entry_locales` (`collection`,`locale`,`status`,`published_at`);--> statement-breakpoint
CREATE TABLE `vulse_entry_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`locale` text NOT NULL,
	`version` integer NOT NULL,
	`content` text NOT NULL,
	`author_id` text,
	`change_summary` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `vulse_entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vulse_entry_revisions_entry_locale_version` ON `vulse_entry_revisions` (`entry_id`,`locale`,`version`);--> statement-breakpoint
CREATE TABLE `vulse_media` (
	`id` text PRIMARY KEY NOT NULL,
	`r2_key` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`width` integer,
	`height` integer,
	`alt` text,
	`blurhash` text,
	`uploaded_by` text,
	`created_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `vulse_media_active` ON `vulse_media` (`created_at`) WHERE `deleted_at` IS NULL;--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `vulse_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text DEFAULT 'member' NOT NULL CHECK (`role` IN ('admin', 'editor', 'member')),
	`display_name` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
