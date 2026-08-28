-- AI 资料库：非正式写作成果与受控正式成果关联。正式资料仍复用 documents/document_versions 生命周期。
CREATE TABLE writing_artifacts (
  id TEXT PRIMARY KEY NOT NULL,
  writing_document_id TEXT NOT NULL,
  writing_version_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  owner_department TEXT NOT NULL,
  artifact_type TEXT NOT NULL DEFAULT 'writing_output',
  content TEXT NOT NULL,
  structured_content_json TEXT NOT NULL DEFAULT '',
  private_reference_ids_json TEXT NOT NULL DEFAULT '[]',
  formal_evidence_ids_json TEXT NOT NULL DEFAULT '[]',
  model_audit_ref TEXT,
  status TEXT NOT NULL DEFAULT 'NON_FORMAL',
  formalized_at TEXT,
  formalized_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX writing_artifacts_version_unique ON writing_artifacts (writing_version_id);
CREATE INDEX writing_artifacts_owner_idx ON writing_artifacts (owner_user_id);
CREATE INDEX writing_artifacts_writing_idx ON writing_artifacts (writing_document_id);
CREATE INDEX writing_artifacts_status_idx ON writing_artifacts (status);

CREATE TABLE formal_artifacts (
  id TEXT PRIMARY KEY NOT NULL,
  source_writing_artifact_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  owner_department TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review',
  formalized_by_user_id TEXT NOT NULL,
  formalized_by TEXT NOT NULL,
  formalized_at TEXT NOT NULL,
  knowledge_document_id TEXT NOT NULL,
  knowledge_version_id TEXT NOT NULL,
  audit_log_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX formal_artifacts_source_unique ON formal_artifacts (source_writing_artifact_id);
CREATE INDEX formal_artifacts_document_idx ON formal_artifacts (knowledge_document_id);
CREATE INDEX formal_artifacts_owner_idx ON formal_artifacts (owner_user_id);
CREATE INDEX formal_artifacts_status_idx ON formal_artifacts (status);
