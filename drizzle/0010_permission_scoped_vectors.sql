-- 正式资料分段向量索引。local D1 开发阶段使用 JSON 向量 + exact cosine scan，后续可替换为 Qdrant。
ALTER TABLE documents ADD COLUMN vector_status text NOT NULL DEFAULT 'pending';
CREATE INDEX IF NOT EXISTS documents_vector_status_idx ON documents(vector_status);

CREATE TABLE document_embeddings (
  id text PRIMARY KEY NOT NULL,
  document_id text NOT NULL,
  version_id text NOT NULL,
  chunk_id text NOT NULL,
  model text NOT NULL,
  vector_json text NOT NULL,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX document_embedding_version_chunk_unique ON document_embeddings(version_id, chunk_id);
CREATE INDEX document_embeddings_document_idx ON document_embeddings(document_id);
CREATE INDEX document_embeddings_version_idx ON document_embeddings(version_id);
CREATE INDEX document_embeddings_chunk_idx ON document_embeddings(chunk_id);
