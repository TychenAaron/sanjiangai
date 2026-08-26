-- 本文件仅用于本机 local D1 创建虚构测试账号和试用部门。
-- 严禁写入集团真实姓名、真实邮箱、真实资料或生产环境数据。

INSERT OR IGNORE INTO departments (id, name, status, created_at)
VALUES
  ('local-dept-admin', '试用管理组', 'active', CURRENT_TIMESTAMP),
  ('local-dept-business', '试用业务部', 'active', CURRENT_TIMESTAMP),
  ('local-dept-finance', '财务试用部', 'active', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO users (
  id, name, email, employee_no, department_id, department_name, role,
  position_level, clearance_level, status, created_at
)
VALUES
  ('local-admin-user', '本地测试管理员', 'local.admin@sanjiang.test', 'LOCAL-ADMIN', 'local-dept-admin', '试用管理组', 'system_admin', 5, 3, 'active', CURRENT_TIMESTAMP),
  ('local-staff-user', '本地测试员工', 'local.staff@sanjiang.test', 'LOCAL-STAFF', 'local-dept-business', '试用业务部', 'employee', 1, 1, 'active', CURRENT_TIMESTAMP),
  ('local-manager-user', '本地测试部门负责人', 'local.manager@sanjiang.test', 'LOCAL-MANAGER', 'local-dept-business', '试用业务部', 'department_head', 3, 2, 'active', CURRENT_TIMESTAMP),
  ('local-finance-user', '本地测试财务负责人', 'local.finance@sanjiang.test', 'LOCAL-FIN', 'local-dept-finance', '财务试用部', 'group_leader', 4, 3, 'active', CURRENT_TIMESTAMP);
