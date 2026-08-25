CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`version_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`submitted_by` text DEFAULT '项目管理员' NOT NULL,
	`reviewer` text,
	`comment` text,
	`submitted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`reviewed_at` text
);
--> statement-breakpoint
CREATE INDEX `approvals_status_idx` ON `approvals` (`status`);--> statement-breakpoint
CREATE INDEX `approvals_document_idx` ON `approvals` (`document_id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`operator` text DEFAULT '项目管理员' NOT NULL,
	`detail` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_logs_created_at_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `departments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `document_acl` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`can_read` integer DEFAULT true NOT NULL,
	`can_edit` integer DEFAULT false NOT NULL,
	`can_review` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `document_acl_document_idx` ON `document_acl` (`document_id`);--> statement-breakpoint
CREATE TABLE `document_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`version_no` integer NOT NULL,
	`content` text NOT NULL,
	`change_summary` text DEFAULT '首次入库' NOT NULL,
	`version_status` text DEFAULT 'pending' NOT NULL,
	`created_by` text DEFAULT '项目管理员' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_version_unique` ON `document_versions` (`document_id`,`version_no`);--> statement-breakpoint
CREATE INDEX `document_versions_document_idx` ON `document_versions` (`document_id`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`document_type` text DEFAULT '其他资料' NOT NULL,
	`source_type` text NOT NULL,
	`source_ref` text,
	`owner_department` text DEFAULT '集团办公室' NOT NULL,
	`security_level` text DEFAULT '内部' NOT NULL,
	`permission_scope` text DEFAULT '集团本部' NOT NULL,
	`lifecycle_status` text DEFAULT 'effective' NOT NULL,
	`knowledge_status` text DEFAULT 'pending' NOT NULL,
	`current_version` integer DEFAULT 1 NOT NULL,
	`created_by` text DEFAULT '项目管理员' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `documents_updated_at_idx` ON `documents` (`updated_at`);--> statement-breakpoint
CREATE INDEX `documents_status_idx` ON `documents` (`knowledge_status`);--> statement-breakpoint
CREATE INDEX `documents_source_idx` ON `documents` (`source_type`);--> statement-breakpoint
CREATE TABLE `policies` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`title` text NOT NULL,
	`publish_date` text,
	`original_url` text NOT NULL,
	`content_hash` text,
	`review_status` text DEFAULT 'pending' NOT NULL,
	`knowledge_document_id` text,
	`discovered_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `policies_original_url_unique` ON `policies` (`original_url`);--> statement-breakpoint
CREATE INDEX `policies_review_status_idx` ON `policies` (`review_status`);--> statement-breakpoint
CREATE TABLE `policy_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`agency` text NOT NULL,
	`base_url` text NOT NULL,
	`check_interval` text DEFAULT 'daily' NOT NULL,
	`status` text DEFAULT 'enabled' NOT NULL,
	`last_checked_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`found_count` integer DEFAULT 0 NOT NULL,
	`imported_count` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`started_at` text,
	`finished_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`department_id` text,
	`role` text DEFAULT 'employee' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
