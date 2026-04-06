CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`space` text DEFAULT 'chat' NOT NULL,
	`project_key` text,
	`confirm_mode` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_conversations_updated_at` ON `conversations` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_conversations_space_updated_at` ON `conversations` (`space`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_conversations_space_project_updated_at` ON `conversations` (`space`,`project_key`,`updated_at`);--> statement-breakpoint
CREATE TABLE `delegate_sessions` (
	`task_id` text PRIMARY KEY NOT NULL,
	`conversation_id` text,
	`agent_name` text NOT NULL,
	`agent_type` text NOT NULL,
	`system_prompt` text NOT NULL,
	`messages` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_delegate_sessions_conversation` ON `delegate_sessions` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `idx_delegate_sessions_updated` ON `delegate_sessions` (`updated_at`);--> statement-breakpoint
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
	`attachments` text,
	`reasoning` text,
	`model` text,
	`tool_calls` text,
	`tool_results` text,
	`usage` text,
	`metadata` text,
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
	`workspace_path` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_notes_folder_id` ON `notes` (`folder_id`);--> statement-breakpoint
CREATE INDEX `idx_notes_updated_at` ON `notes` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_notes_workspace_path` ON `notes` (`workspace_path`);--> statement-breakpoint
CREATE TABLE `plugins` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_type` text NOT NULL,
	`version` text NOT NULL,
	`scope` text DEFAULT 'global' NOT NULL,
	`scope_qualifier` text,
	`enabled` integer DEFAULT true NOT NULL,
	`granted_permissions` text NOT NULL,
	`config` text,
	`installed_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_plugins_enabled` ON `plugins` (`enabled`);--> statement-breakpoint
CREATE INDEX `idx_plugins_scope` ON `plugins` (`scope`);--> statement-breakpoint
CREATE TABLE `review_annotation_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`project_key` text NOT NULL,
	`title` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_review_groups_project_key` ON `review_annotation_groups` (`project_key`);--> statement-breakpoint
CREATE TABLE `review_annotations` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`file_path` text NOT NULL,
	`side` text NOT NULL,
	`line_start` integer NOT NULL,
	`line_end` integer NOT NULL,
	`comment` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `review_annotation_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_review_annotations_group` ON `review_annotations` (`group_id`);--> statement-breakpoint
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
CREATE TABLE `task_conversations` (
	`task_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	PRIMARY KEY(`task_id`, `conversation_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`spec` text DEFAULT '' NOT NULL,
	`context_markdown` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'backlog' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`project_key` text NOT NULL,
	`conversation_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_project_status_sort` ON `tasks` (`project_key`,`status`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_tasks_conversation_id` ON `tasks` (`conversation_id`);--> statement-breakpoint
CREATE TABLE `todo_items` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_todo_items_conversation_created` ON `todo_items` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_todo_items_conversation_status` ON `todo_items` (`conversation_id`,`status`);--> statement-breakpoint
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