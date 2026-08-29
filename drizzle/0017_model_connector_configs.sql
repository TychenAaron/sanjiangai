-- 治理后台的运行时模型连接配置；凭证仅保存服务端 AES-GCM 密文，数据库配置优先于环境变量回退。
CREATE TABLE model_connector_configs (
  id TEXT PRIMARY KEY NOT NULL,
  purpose TEXT NOT NULL,
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  credential_ciphertext TEXT,
  timeout_ms INTEGER NOT NULL DEFAULT 15000,
  endpoint_path TEXT,
  enabled INTEGER NOT NULL DEFAULT 0,
  last_check_status TEXT,
  last_check_http_status INTEGER,
  last_check_duration_ms INTEGER,
  last_checked_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX model_connector_configs_purpose_unique ON model_connector_configs (purpose);
CREATE INDEX model_connector_configs_enabled_idx ON model_connector_configs (enabled);
