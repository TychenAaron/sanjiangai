-- 正式知识资源生命周期、审批元数据和可靠性评分；仅 local D1 迁移使用，私有写作材料不涉及本表。
ALTER TABLE documents ADD COLUMN resource_status text NOT NULL DEFAULT 'draft';
ALTER TABLE documents ADD COLUMN resource_category text NOT NULL DEFAULT '其他';
ALTER TABLE documents ADD COLUMN source_organization text;
ALTER TABLE documents ADD COLUMN document_date text;
ALTER TABLE documents ADD COLUMN applicable_scope text;
ALTER TABLE documents ADD COLUMN reliability_score integer NOT NULL DEFAULT 0;
ALTER TABLE documents ADD COLUMN review_note text;
CREATE INDEX IF NOT EXISTS documents_resource_status_idx ON documents(resource_status);
