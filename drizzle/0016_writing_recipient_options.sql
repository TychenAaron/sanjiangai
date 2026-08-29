-- 公文报送/发送对象由管理员统一维护；历史 writing_documents 的 recipient 文本继续保留。
CREATE TABLE writing_recipient_options (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX writing_recipient_options_name_unique ON writing_recipient_options (name);
CREATE INDEX writing_recipient_options_enabled_sort_idx ON writing_recipient_options (enabled, sort_order, name);

-- 新建公文保存选项关联，防止选项改名后无法判断它是否已经被历史写作使用；旧记录保持 NULL。
ALTER TABLE writing_documents ADD COLUMN recipient_option_id TEXT;
CREATE INDEX writing_documents_recipient_option_idx ON writing_documents (recipient_option_id);
