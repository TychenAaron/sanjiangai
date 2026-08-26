// 本文件用于在不启动开发服务器的情况下，验证本机测试账号的资料分级权限。
// 它只校验虚构测试账号与虚构资料，不连接真实业务数据，也不写入数据库。

import { canReadDocument, type AccessDocument, type AccessUserLike } from "../lib/document-access.ts";

const localStaff: AccessUserLike = {
  id: "local-staff-user",
  departmentName: "试用业务部",
  role: "employee",
  positionLevel: 1,
  clearanceLevel: 1,
};

const localManager: AccessUserLike = {
  id: "local-manager-user",
  departmentName: "试用业务部",
  role: "department_head",
  positionLevel: 3,
  clearanceLevel: 2,
};

const localFinance: AccessUserLike = {
  id: "local-finance-user",
  departmentName: "财务试用部",
  role: "group_leader",
  positionLevel: 4,
  clearanceLevel: 3,
};

const localAdmin: AccessUserLike = {
  id: "local-admin-user",
  departmentName: "试用管理组",
  role: "system_admin",
  positionLevel: 5,
  clearanceLevel: 3,
};

const publicDocument: AccessDocument = {
  id: "doc-public",
  ownerDepartment: "试用业务部",
  securityLevel: "public",
  permissionScope: "公司全员",
  lifecycleStatus: "effective",
  knowledgeStatus: "approved",
  createdByUserId: null,
};

const internalDocument: AccessDocument = {
  ...publicDocument,
  id: "doc-internal",
  securityLevel: "internal",
};

const sensitiveDocument: AccessDocument = {
  ...publicDocument,
  id: "doc-sensitive",
  securityLevel: "sensitive",
  permissionScope: "责任部门",
};

const financeSensitiveDocument: AccessDocument = {
  ...sensitiveDocument,
  id: "doc-sensitive-finance",
  ownerDepartment: "财务试用部",
};

const confidentialDocument: AccessDocument = {
  ...publicDocument,
  id: "doc-confidential",
  securityLevel: "confidential",
  permissionScope: "领导班子",
};

function assertEqual(actual: boolean, expected: boolean, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}：期望 ${expected ? "可读" : "不可读"}，实际为 ${actual ? "可读" : "不可读"}`);
  }
  console.log(`PASS ${label}: ${actual ? "可读" : "不可读"}`);
}

assertEqual(canReadDocument(localStaff, publicDocument), true, "普通员工读取公开资料");
assertEqual(canReadDocument(localStaff, internalDocument), true, "普通员工读取内部资料");
assertEqual(canReadDocument(localStaff, sensitiveDocument), false, "普通员工读取敏感资料");
assertEqual(canReadDocument(localStaff, confidentialDocument), false, "普通员工读取机密资料");

assertEqual(canReadDocument(localManager, sensitiveDocument), true, "部门负责人读取敏感资料");
assertEqual(canReadDocument(localManager, financeSensitiveDocument), false, "业务部负责人读取财务敏感资料");
assertEqual(canReadDocument(localFinance, sensitiveDocument), false, "财务负责人读取业务敏感资料");
assertEqual(canReadDocument(localFinance, financeSensitiveDocument), true, "财务负责人读取财务敏感资料");
assertEqual(
  canReadDocument(localStaff, internalDocument, [{ documentId: "doc-internal", subjectType: "user", subjectId: localManager.id, canRead: true, canEdit: false, canReview: false }]),
  false,
  "ACL 不扩大普通员工读取权限",
);

assertEqual(canReadDocument(localAdmin, publicDocument), true, "系统管理员读取公开资料");
assertEqual(canReadDocument(localAdmin, internalDocument), true, "系统管理员读取内部资料");
assertEqual(canReadDocument(localAdmin, sensitiveDocument), true, "系统管理员读取敏感资料");
assertEqual(canReadDocument(localAdmin, confidentialDocument), true, "系统管理员读取机密资料");
