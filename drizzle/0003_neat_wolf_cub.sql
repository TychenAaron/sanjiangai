CREATE TABLE `blocked_terms` (
	`id` text PRIMARY KEY NOT NULL,
	`term` text NOT NULL,
	`normalized_term` text NOT NULL,
	`category` text DEFAULT '自定义禁止项' NOT NULL,
	`match_scope` text DEFAULT 'all' NOT NULL,
	`note` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blocked_terms_normalized_unique` ON `blocked_terms` (`normalized_term`);--> statement-breakpoint
CREATE INDEX `blocked_terms_enabled_idx` ON `blocked_terms` (`enabled`);