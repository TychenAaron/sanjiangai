-- 本迁移为公文工作区增加私有参考材料表；材料仅供当前工作区人工写作参考，不进入 documents 正式知识库。
CREATE TABLE `writing_private_references` (
  `id` text PRIMARY KEY NOT NULL,
  `writing_document_id` text NOT NULL,
  `file_name` text NOT NULL,
  `mime_type` text DEFAULT 'application/octet-stream' NOT NULL,
  `file_size` integer DEFAULT 0 NOT NULL,
  `parse_format` text NOT NULL,
  `parse_status` text NOT NULL,
  `parsed_text` text DEFAULT '' NOT NULL,
  `locations_json` text DEFAULT '[]' NOT NULL,
  `parse_reason` text,
  `created_by_user_id` text NOT NULL,
  `created_by` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `writing_private_references_document_idx` ON `writing_private_references` (`writing_document_id`);
--> statement-breakpoint
CREATE INDEX `writing_private_references_creator_idx` ON `writing_private_references` (`created_by_user_id`);
