CREATE TABLE `document_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`version_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`content` text NOT NULL,
	`char_count` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_chunk_unique` ON `document_chunks` (`version_id`,`chunk_index`);--> statement-breakpoint
CREATE INDEX `document_chunks_document_idx` ON `document_chunks` (`document_id`);--> statement-breakpoint
CREATE INDEX `document_chunks_version_idx` ON `document_chunks` (`version_id`);--> statement-breakpoint
ALTER TABLE `documents` ADD `file_name` text;--> statement-breakpoint
ALTER TABLE `documents` ADD `storage_key` text;--> statement-breakpoint
ALTER TABLE `documents` ADD `mime_type` text;--> statement-breakpoint
ALTER TABLE `documents` ADD `file_size` integer;--> statement-breakpoint
ALTER TABLE `documents` ADD `parse_status` text DEFAULT 'parsed' NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` ADD `index_status` text DEFAULT 'ready' NOT NULL;