// 本文件用于集中维护资料读取、编辑、审核的纯权限判断规则。
// 它不直接访问数据库，便于在本机验证脚本和正式业务代码中复用同一套规则。

export type AccessDocument = {
  id: string;
  ownerDepartment: string;
  securityLevel: string;
  permissionScope: string;
  lifecycleStatus: string;
  knowledgeStatus: string;
  createdByUserId: string | null;
};

export type AccessGrant = {
  documentId: string;
  subjectType: string;
  subjectId: string;
  canRead: boolean;
  canEdit: boolean;
  canReview: boolean;
};

export type AccessUserLike = {
  id: string;
  departmentName: string;
  role: string;
  positionLevel: number;
  clearanceLevel: number;
};

const reviewRoles = new Set(["reviewer", "knowledge_admin", "system_admin"]);

// 说明：把中文和英文的资料级别统一换算成可比较的内部等级。
// 输入是资料级别字符串，输出是 1 到 3 的等级数字，数字越大表示越敏感。
function getSecurityTier(securityLevel: string) {
  return {
    public: 1,
    "公开": 1,
    internal: 1,
    "内部": 1,
    sensitive: 2,
    "敏感": 2,
    confidential: 3,
    "机密": 3,
  }[securityLevel] ?? 3;
}

// 说明：判断资料是否属于“敏感级”。
// 这类资料除部门负责人、平台主管、系统管理员等高权限人员外，普通员工不能查看。
function isSensitiveDocument(securityLevel: string) {
  return securityLevel === "sensitive" || securityLevel === "敏感";
}

// 说明：判断资料是否属于“机密级”。
// 机密资料只允许系统管理员查看，本机测试环境也不能放宽这条规则。
function isConfidentialDocument(securityLevel: string) {
  return securityLevel === "confidential" || securityLevel === "机密";
}

// 说明：判断账号能否通过当前在线入口提交指定密级的资料。
// 输入是已由认证入口确认的账号、资料密级与责任部门，输出是是否允许进入上传流程。
// 公开和内部资料都属于基础资料级别；敏感资料仍需同时满足角色、数据级别和责任部门规则；机密资料始终拒绝，必须走后续专用流程。
export function canUploadDocument(
  user: AccessUserLike,
  securityLevel: string,
  ownerDepartment: string,
) {
  if (isConfidentialDocument(securityLevel)) return false;
  if (getSecurityTier(securityLevel) <= 1) return user.clearanceLevel >= 1;
  if (!isSensitiveDocument(securityLevel) || user.clearanceLevel < 2) return false;

  return (
    new Set(["department_head", "group_leader", "knowledge_admin", "system_admin"]).has(user.role) &&
    (user.role === "system_admin" || user.departmentName === ownerDepartment)
  );
}

// 说明：这是资料读取权限的核心判断函数。
// 输入是当前用户、目标资料和可选的单独授权记录，输出是当前用户是否可以读取该资料。
// 它继续使用角色、部门、岗位级别、数据级别和 document_acl 判断，不能通过邮件地址直接放权。
export function canReadDocument(
  user: AccessUserLike,
  document: AccessDocument,
  grants: AccessGrant[] = [],
) {
  const documentGrants = grants.filter((grant) => grant.documentId === document.id);
  const direct = documentGrants.find(
    (grant) =>
      grant.documentId === document.id &&
      grant.subjectType === "user" &&
      grant.subjectId === user.id,
  );

  if (getSecurityTier(document.securityLevel) > user.clearanceLevel) return false;

  // 说明：机密资料只允许系统管理员读取，即使是本机测试账号也必须遵守。
  if (isConfidentialDocument(document.securityLevel) && user.role !== "system_admin") {
    return false;
  }

  // 说明：敏感资料要求账号至少是部门负责人、平台主管、知识管理员或系统管理员。
  // 这样可以保证普通员工即使在本部门，也不能直接查看敏感资料。
  if (
    isSensitiveDocument(document.securityLevel) &&
    !new Set(["department_head", "group_leader", "knowledge_admin", "system_admin"]).has(
      user.role,
    )
  ) {
    return false;
  }

  // 说明：敏感资料在满足角色与数据级别后，仍必须属于当前责任部门。
  // 这样本机财务负责人和业务部负责人只能查看各自部门的敏感资料；系统管理员保留跨部门管理能力。
  if (
    isSensitiveDocument(document.securityLevel) &&
    user.role !== "system_admin" &&
    user.departmentName !== document.ownerDepartment
  ) {
    return false;
  }

  const scopeAllowed =
    document.securityLevel === "公开" ||
    document.securityLevel === "public" ||
    document.permissionScope === "集团全员" ||
    document.permissionScope === "公司全员" ||
    (document.permissionScope === "集团本部" &&
      (user.positionLevel >= 4 || user.departmentName !== "所属子公司")) ||
    ((document.permissionScope === "责任部门" ||
      document.permissionScope === "本部门") &&
      (document.ownerDepartment === user.departmentName || user.positionLevel >= 4)) ||
    (document.permissionScope === "领导班子" && user.positionLevel >= 4);

  if (!scopeAllowed) return false;

  // 说明：document_acl 只能在既有角色、部门和数据级别权限基础上继续收窄。
  // 某份资料配置了 ACL 后，只有同一资料中明确 canRead=true 的账号才能读取；
  // ACL 不能让原本因角色、部门或密级无权的账号获得读取权限。
  if (documentGrants.length > 0 && !direct?.canRead) return false;
  if (
    document.lifecycleStatus !== "effective" &&
    document.createdByUserId !== user.id &&
    user.role !== "knowledge_admin"
  ) {
    return false;
  }
  if (
    document.knowledgeStatus !== "approved" &&
    document.createdByUserId !== user.id &&
    !reviewRoles.has(user.role)
  ) {
    return false;
  }
  return true;
}

// 说明：编辑权限必须建立在可读的前提上，并继续遵守创建人、知识管理员和单独授权规则。
export function canEditDocument(
  user: AccessUserLike,
  document: AccessDocument,
  grants: AccessGrant[] = [],
) {
  const direct = grants.find(
    (grant) =>
      grant.documentId === document.id &&
      grant.subjectType === "user" &&
      grant.subjectId === user.id,
  );
  return (
    canReadDocument(user, document, grants) &&
    (document.createdByUserId === user.id ||
      user.role === "knowledge_admin" ||
      Boolean(direct?.canEdit))
  );
}

// 说明：审核权限必须建立在可读的前提上，并继续遵守审核角色和单独授权规则。
export function canReviewDocument(
  user: AccessUserLike,
  document: AccessDocument,
  grants: AccessGrant[] = [],
) {
  // 说明：系统管理员承担全局审核职责，可审核任何待审核资料；这不改变普通员工读取或审核权限。
  if (user.role === "system_admin" && document.knowledgeStatus === "pending") return true;

  const direct = grants.find(
    (grant) =>
      grant.documentId === document.id &&
      grant.subjectType === "user" &&
      grant.subjectId === user.id,
  );
  return (
    canReadDocument(user, document, grants) &&
    (reviewRoles.has(user.role) || Boolean(direct?.canReview))
  );
}
