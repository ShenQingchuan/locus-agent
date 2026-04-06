CREATE TABLE `review_annotation_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`title` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_review_groups_conversation` ON `review_annotation_groups` (`conversation_id`);--> statement-breakpoint
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
CREATE INDEX `idx_review_annotations_group` ON `review_annotations` (`group_id`);
