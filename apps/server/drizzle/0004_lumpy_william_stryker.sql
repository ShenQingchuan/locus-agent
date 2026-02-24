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