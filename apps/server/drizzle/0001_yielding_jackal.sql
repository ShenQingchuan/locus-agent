ALTER TABLE `conversations` ADD `space` text DEFAULT 'chat' NOT NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `project_key` text;--> statement-breakpoint
CREATE INDEX `idx_conversations_space_updated_at` ON `conversations` (`space`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_conversations_space_project_updated_at` ON `conversations` (`space`,`project_key`,`updated_at`);