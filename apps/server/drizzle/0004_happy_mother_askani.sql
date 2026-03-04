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
CREATE INDEX `idx_todo_items_conversation_status` ON `todo_items` (`conversation_id`,`status`);