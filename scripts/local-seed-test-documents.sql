-- 本文件仅用于向本机 local D1 写入虚构资料元数据，绝不包含真实文件、正文或附件。
-- 固定资料 ID 仅服务于重复执行的本机测试，严禁用于线上 D1 或生产资料。

INSERT INTO documents (
  id, title, document_type, source_type, source_ref, owner_department,
  security_level, permission_scope, lifecycle_status, trial_data_class,
  is_trial_data, file_name, storage_key, mime_type, file_size,
  parse_status, index_status, knowledge_status, current_version,
  created_by, created_by_user_id, created_at, updated_at
)
VALUES
  ('local-doc-public', '本机测试｜集团公开通知', '本机测试资料', 'local_test', 'LOCAL-PUBLIC', '试用管理组', 'public', '公司全员', 'effective', 'T1-公开资料', 1, NULL, NULL, NULL, NULL, 'not_applicable', 'not_applicable', 'approved', 1, '本地测试管理员', 'local-admin-user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('local-doc-internal', '本机测试｜内部工作指引', '本机测试资料', 'local_test', 'LOCAL-INTERNAL', '试用管理组', 'internal', '公司全员', 'effective', 'T2-内部脱敏测试', 1, NULL, NULL, NULL, NULL, 'not_applicable', 'not_applicable', 'approved', 1, '本地测试管理员', 'local-admin-user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('local-doc-sensitive-business', '本机测试｜试用业务部敏感资料', '本机测试资料', 'local_test', 'LOCAL-SENSITIVE-BUSINESS', '试用业务部', 'sensitive', '责任部门', 'effective', 'T3-部门隔离测试', 1, NULL, NULL, NULL, NULL, 'not_applicable', 'not_applicable', 'approved', 1, '本地测试管理员', 'local-admin-user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('local-doc-sensitive-finance', '本机测试｜财务试用部敏感资料', '本机测试资料', 'local_test', 'LOCAL-SENSITIVE-FINANCE', '财务试用部', 'sensitive', '责任部门', 'effective', 'T3-部门隔离测试', 1, NULL, NULL, NULL, NULL, 'not_applicable', 'not_applicable', 'approved', 1, '本地测试管理员', 'local-admin-user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('local-doc-confidential', '本机测试｜本机机密测试资料', '本机测试资料', 'local_test', 'LOCAL-CONFIDENTIAL', '试用管理组', 'confidential', '领导班子', 'effective', 'T3-部门隔离测试', 1, NULL, NULL, NULL, NULL, 'not_applicable', 'not_applicable', 'approved', 1, '本地测试管理员', 'local-admin-user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  document_type = excluded.document_type,
  source_type = excluded.source_type,
  source_ref = excluded.source_ref,
  owner_department = excluded.owner_department,
  security_level = excluded.security_level,
  permission_scope = excluded.permission_scope,
  lifecycle_status = excluded.lifecycle_status,
  trial_data_class = excluded.trial_data_class,
  is_trial_data = excluded.is_trial_data,
  file_name = NULL,
  storage_key = NULL,
  mime_type = NULL,
  file_size = NULL,
  parse_status = excluded.parse_status,
  index_status = excluded.index_status,
  knowledge_status = excluded.knowledge_status,
  current_version = excluded.current_version,
  created_by = excluded.created_by,
  created_by_user_id = excluded.created_by_user_id,
  updated_at = CURRENT_TIMESTAMP;
