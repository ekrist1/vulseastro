CREATE TABLE `vulse_collections` (
	`handle` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`definition` text NOT NULL,
	`blueprint_hash` text NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`singleton` integer DEFAULT 0 NOT NULL,
	`tree` integer DEFAULT 0 NOT NULL,
	`drafts` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vulse_sets` (
	`handle` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`definition` text NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
