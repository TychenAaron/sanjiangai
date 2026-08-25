PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`employee_no` text,
	`department_id` text,
	`department_name` text DEFAULT '集团办公室' NOT NULL,
	`role` text DEFAULT 'employee' NOT NULL,
	`position_level` integer DEFAULT 1 NOT NULL,
	`clearance_level` integer DEFAULT 2 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "name", "email", "employee_no", "department_id", "department_name", "role", "position_level", "clearance_level", "status", "created_at") SELECT "id", "name", COALESCE("email", "id" || '@invalid.local'), NULL, "department_id", '集团办公室', "role", 1, 2, "status", "created_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
ALTER TABLE `documents` ADD `trial_data_class` text DEFAULT 'T2-内部脱敏测试' NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` ADD `is_trial_data` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` ADD `created_by_user_id` text;
