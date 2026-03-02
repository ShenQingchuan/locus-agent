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
CREATE INDEX `idx_tasks_conversation_id` ON `tasks` (`conversation_id`);