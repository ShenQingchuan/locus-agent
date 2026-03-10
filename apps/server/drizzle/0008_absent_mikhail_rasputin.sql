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
CREATE INDEX `idx_plugins_scope` ON `plugins` (`scope`);