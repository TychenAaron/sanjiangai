-- 管理员批量导入只为既有正式知识资料增加资料集与批次追溯，不另建解析、分段、审核或 RAG 体系。
CREATE TABLE knowledge_datasets (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX knowledge_datasets_name_unique ON knowledge_datasets (name);

CREATE TABLE knowledge_import_batches (
  id TEXT PRIMARY KEY NOT NULL,
  dataset_id TEXT NOT NULL,
  uploader_user_id TEXT NOT NULL,
  uploader TEXT NOT NULL,
  document_type TEXT NOT NULL,
  resource_category TEXT NOT NULL,
  security_level TEXT NOT NULL,
  permission_scope TEXT NOT NULL,
  owner_department TEXT NOT NULL,
  source_organization TEXT,
  document_date TEXT,
  applicable_scope TEXT,
  trial_data_class TEXT NOT NULL,
  total_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'uploading',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
CREATE INDEX knowledge_import_batches_dataset_idx ON knowledge_import_batches (dataset_id);
CREATE INDEX knowledge_import_batches_uploader_idx ON knowledge_import_batches (uploader_user_id);
CREATE INDEX knowledge_import_batches_created_idx ON knowledge_import_batches (created_at);

CREATE TABLE knowledge_import_items (
  id TEXT PRIMARY KEY NOT NULL,
  batch_id TEXT NOT NULL,
  client_file_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT,
  status TEXT NOT NULL,
  reason TEXT,
  document_id TEXT,
  version_id TEXT,
  parse_status TEXT,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  index_status TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
CREATE UNIQUE INDEX knowledge_import_item_batch_file_unique ON knowledge_import_items (batch_id, client_file_key);
CREATE INDEX knowledge_import_items_batch_idx ON knowledge_import_items (batch_id);
CREATE INDEX knowledge_import_items_document_idx ON knowledge_import_items (document_id);
CREATE INDEX knowledge_import_items_status_idx ON knowledge_import_items (status);

ALTER TABLE documents ADD COLUMN dataset_id TEXT;
ALTER TABLE documents ADD COLUMN import_batch_id TEXT;
CREATE INDEX documents_dataset_idx ON documents (dataset_id);
CREATE INDEX documents_import_batch_idx ON documents (import_batch_id);
