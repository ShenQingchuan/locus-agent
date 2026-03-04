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
CREATE INDEX `idx_delegate_sessions_updated` ON `delegate_sessions` (`updated_at`);