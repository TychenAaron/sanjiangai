-- 本迁移只创建公文写作工作区与版本表；它们不与正式知识库 documents 自动关联。
CREATE TABLE `writing_documents` (
  `id` text PRIMARY KEY NOT NULL, `document_type` text NOT NULL, `title` text NOT NULL,
  `submitting_department` text NOT NULL, `recipient` text NOT NULL, `facts` text NOT NULL,
  `reference_query` text NOT NULL, `references_json` text DEFAULT '[]' NOT NULL, `status` text DEFAULT 'outline' NOT NULL,
  `created_by_user_id` text NOT NULL, `created_by` text NOT NULL, `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `writing_documents_creator_idx` ON `writing_documents` (`created_by_user_id`);--> statement-breakpoint
CREATE INDEX `writing_documents_updated_idx` ON `writing_documents` (`updated_at`);--> statement-breakpoint
CREATE TABLE `writing_versions` (
  `id` text PRIMARY KEY NOT NULL, `writing_document_id` text NOT NULL, `version_no` integer NOT NULL,
  `stage` text NOT NULL, `content` text NOT NULL, `checks_json` text DEFAULT '[]' NOT NULL,
  `created_by_user_id` text NOT NULL, `created_by` text NOT NULL, `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `writing_versions_unique` ON `writing_versions` (`writing_document_id`, `version_no`);--> statement-breakpoint
CREATE INDEX `writing_versions_document_idx` ON `writing_versions` (`writing_document_id`);
