CREATE TABLE `memory_access_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`conversation_id` text,
	`access_type` text NOT NULL,
	`accessed_at` integer NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_memory_access_logs_note_id` ON `memory_access_logs` (`note_id`);--> statement-breakpoint
CREATE INDEX `idx_memory_access_logs_accessed_at` ON `memory_access_logs` (`accessed_at`);--> statement-breakpoint
CREATE TABLE `memory_mining_jobs` (
	`conversation_id` text PRIMARY KEY NOT NULL,
	`mined_at` integer NOT NULL,
	`notes_created` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `notes` ADD `pinned` integer DEFAULT false NOT NULL;