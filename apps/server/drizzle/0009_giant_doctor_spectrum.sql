ALTER TABLE `notes` ADD `workspace_path` text;--> statement-breakpoint
CREATE INDEX `idx_notes_workspace_path` ON `notes` (`workspace_path`);