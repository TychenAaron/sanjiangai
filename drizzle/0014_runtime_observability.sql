-- 为最小审计记录增加 request_id 关联字段；不保存请求正文、凭证、密钥或 D4 内容。
ALTER TABLE audit_logs ADD COLUMN request_id TEXT;
CREATE INDEX audit_logs_request_id_idx ON audit_logs (request_id);
