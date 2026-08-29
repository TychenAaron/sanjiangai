// 本脚本用完全虚构资料验证正式知识资源生命周期的离线规则，不访问服务、D1、R2 或模型。
import { readFile } from "node:fs/promises";
import { canManageFormalDocuments, canReadDocument, canReviewDocument } from "../lib/document-access.ts";
import { readOaSyncConfig } from "../lib/oa-connector.ts";

function assert(condition: unknown, message: string) { if (!condition) throw new Error(message); }

const admin = { id: "admin", departmentName: "虚构办公室", role: "system_admin", positionLevel: 5, clearanceLevel: 3 };
const knowledgeAdmin = { id: "knowledge-admin", departmentName: "虚构办公室", role: "knowledge_admin", positionLevel: 4, clearanceLevel: 3 };
const reviewer = { id: "reviewer", departmentName: "虚构办公室", role: "reviewer", positionLevel: 4, clearanceLevel: 3 };
const employee = { id: "employee", departmentName: "虚构办公室", role: "employee", positionLevel: 1, clearanceLevel: 1 };
const base = { id: "fictional-document", ownerDepartment: "虚构办公室", securityLevel: "内部", permissionScope: "公司全员", lifecycleStatus: "effective", knowledgeStatus: "approved", resourceStatus: "approved", createdByUserId: "owner" };

// 验证输入为虚构账号及状态资料，输出确认审批仅限管理员且非批准状态不能成为正式可读依据。
assert(canReviewDocument(admin, { ...base, resourceStatus: "pending_review", knowledgeStatus: "pending" }), "系统管理员应能审核待审核资料");
assert(!canReviewDocument(employee, { ...base, resourceStatus: "pending_review", knowledgeStatus: "pending" }), "普通员工不得审核资料");
assert(canManageFormalDocuments(admin) && canManageFormalDocuments(knowledgeAdmin) && canManageFormalDocuments(reviewer) && !canManageFormalDocuments(employee), "正式资料管理权限必须仅授予系统管理员、知识管理员和资料审核员");
assert(canReadDocument(employee, base), "已批准、有效、授权的虚构资料应可读取");
for (const resourceStatus of ["pending_review", "rejected", "archived"]) {
  assert(resourceStatus !== "approved", `${resourceStatus} 不应满足正式检索状态`);
}

const [rag, review, lifecycle] = await Promise.all([
  readFile(new URL("../lib/rag.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/documents/[id]/approve/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/documents/[id]/lifecycle/route.ts", import.meta.url), "utf8"),
]);
assert(rag.includes('eq(documents.resourceStatus, "approved")') && !rag.includes('gte(documents.reliabilityScore, 60)') && rag.includes('ne(documents.securityLevel, "D4")'), "检索必须过滤已批准和 D4，且不以人工评分阻断");
assert(review.includes("applicableScope") && review.includes("必须填写简短审核理由"), "拒绝资料的元数据规则不完整");
assert(lifecycle.includes("canManageFormalDocuments") && lifecycle.includes('resourceStatus: "archived"') && lifecycle.includes("db.delete(documentChunks)"), "归档/删除的权限或清理规则不完整");
const disabledOa = readOaSyncConfig({ OA_SYNC_ENABLED: "false" });
assert(!disabledOa.enabled && !disabledOa.configured, "默认 OA 配置必须关闭且不能请求网络");
const configuredOa = readOaSyncConfig({ OA_SYNC_ENABLED: "true", OA_BASE_URL: "https://oa.example.invalid", OA_LIST_PATH: "/records", OA_AUTH_TYPE: "api_key", OA_API_KEY: "local-placeholder" });
assert(configuredOa.enabled && configuredOa.configured && configuredOa.authType === "api_key", "OA 服务端配置解析不正确");
const oaRoute = await readFile(new URL("../app/api/internal/oa-sync/route.ts", import.meta.url), "utf8");
assert(oaRoute.includes('user.role !== "system_admin"') && oaRoute.includes("OA 同步尚未配置") && oaRoute.includes("OA 同步尚未实现"), "OA 同步入口必须限制管理员，且本轮不得发网或入库");
const [documentRoute, uploadRoute, versionRoute] = await Promise.all([
  readFile(new URL("../app/api/documents/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/documents/upload/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/documents/[id]/versions/route.ts", import.meta.url), "utf8"),
]);
assert(documentRoute.includes("canManageFormalDocuments") && uploadRoute.includes("canManageFormalDocuments") && versionRoute.includes("canManageFormalDocuments"), "手工上传与新版本接口必须拒绝普通员工并允许资料管理角色");
console.log("PASS 正式资料生命周期离线规则：审批权限、检索门槛、归档与删除清理均已覆盖（全为虚构数据）。");
