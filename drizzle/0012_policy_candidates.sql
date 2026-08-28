-- 政策候选仅供人工审核，不能直接作为正式知识或 RAG 依据。
CREATE TABLE policy_candidates (id TEXT PRIMARY KEY NOT NULL, policy_source_id TEXT NOT NULL, title TEXT NOT NULL, document_number TEXT, issuing_body TEXT, publish_date TEXT, effective_date TEXT, source_reference TEXT, raw_content TEXT NOT NULL, content_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING_REVIEW', reviewed_by TEXT, reviewed_at TEXT, review_comment TEXT, knowledge_document_id TEXT, knowledge_version_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX policy_candidate_identity_hash_unique ON policy_candidates (policy_source_id, title, content_hash);
CREATE INDEX policy_candidates_status_idx ON policy_candidates (status);
CREATE INDEX policy_candidates_source_idx ON policy_candidates (policy_source_id);
