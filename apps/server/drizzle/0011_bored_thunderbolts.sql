PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_review_annotation_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`project_key` text NOT NULL,
	`title` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_review_annotation_groups`("id", "project_key", "title", "created_at", "updated_at") SELECT "id", "project_key", "title", "created_at", "updated_at" FROM `review_annotation_groups`;--> statement-breakpoint
DROP TABLE `review_annotation_groups`;--> statement-breakpoint
ALTER TABLE `__new_review_annotation_groups` RENAME TO `review_annotation_groups`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_review_groups_project_key` ON `review_annotation_groups` (`project_key`);