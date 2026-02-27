CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`confirm_mode` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_conversations_updated_at` ON `conversations` (`updated_at`);--> statement-breakpoint
CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_folders_parent_id` ON `folders` (`parent_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`reasoning` text,
	`model` text,
	`tool_calls` text,
	`tool_results` text,
	`usage` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_messages_conversation_id` ON `messages` (`conversation_id`);--> statement-breakpoint
CREATE TABLE `note_conversations` (
	`note_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	PRIMARY KEY(`note_id`, `conversation_id`),
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `note_tags` (
	`note_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`note_id`, `tag_id`),
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_note_tags_tag_id` ON `note_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`editor_state` text,
	`summary` text,
	`folder_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_notes_folder_id` ON `notes` (`folder_id`);--> statement-breakpoint
CREATE INDEX `idx_notes_updated_at` ON `notes` (`updated_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `whitelist_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`tool_name` text NOT NULL,
	`pattern` text,
	`scope` text NOT NULL,
	`conversation_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_whitelist_rules_conversation_id` ON `whitelist_rules` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `idx_whitelist_rules_scope` ON `whitelist_rules` (`scope`);