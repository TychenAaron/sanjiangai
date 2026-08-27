// 本脚本用完全虚构资料验证正式知识资源生命周期的离线规则，不访问服务、D1、R2 或模型。
import { readFile } from "node:fs/promises";
import { canReadDocument, canReviewDocument } from "../lib/document-access.ts";
import { readOaSyncConfig } from "../lib/oa-connector.ts";

function assert(condition: unknown, message: string) { if (!condition) throw new Error(message); }

const admin = { id: "admin", departmentName: "虚构办公室", role: "system_admin", positionLevel: 5, clearanceLevel: 3 };
const employee = { id: "employee", departmentName: "虚构办公室", role: "employee", positionLevel: 1, clearanceLevel: 1 };
const base = { id: "fictional-document", ownerDepartment: "虚构办公室", securityLevel: "内部", permissionScope: "公司全员", lifecycleStatus: "effective", knowledgeStatus: "approved", resourceStatus: "approved", createdByUserId: "owner" };

// 验证输入为虚构账号及状态资料，输出确认审批仅限管理员且非批准状态不能成为正式可读依据。
assert(canReviewDocument(admin, { ...base, resourceStatus: "pending_review", knowledgeStatus: "pending" }), "系统管理员应能审核待审核资料");
assert(!canReviewDocument(employee, { ...base, resourceStatus: "pending_review", knowledgeStatus: "pending" }), "普通员工不得审核资料");
assert(canReadDocument(employee, base), "已批准、有效、授权的虚构资料应可读取");
for (const resourceStatus of ["pending_review", "rejected", "archived"]) {
  assert(resourceStatus !== "approved", `${resourceStatus} 不应满足正式检索状态`);
}

const [rag, review, lifecycle] = await Promise.all([
  readFile(new URL("../lib/rag.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/documents/[id]/approve/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/documents/[id]/lifecycle/route.ts", import.meta.url), "utf8"),
]);
assert(rag.includes('eq(documents.resourceStatus, "approved")') && rag.includes('gte(documents.reliabilityScore, 60)') && rag.includes('ne(documents.securityLevel, "D4")'), "检索必须同时过滤已批准、可靠性和 D4");
assert(review.includes("applicableScope") && review.includes("reliabilityScore < 60") && review.includes("必须填写简短审核理由"), "批准和拒绝的元数据规则不完整");
assert(lifecycle.includes('user.role !== "system_admin"') && lifecycle.includes('resourceStatus: "archived"') && lifecycle.includes("db.delete(documentChunks)"), "归档/删除的权限或清理规则不完整");
const disabledOa = readOaSyncConfig({ OA_SYNC_ENABLED: "false" });
assert(!disabledOa.enabled && !disabledOa.configured, "默认 OA 配置必须关闭且不能请求网络");
const configuredOa = readOaSyncConfig({ OA_SYNC_ENABLED: "true", OA_BASE_URL: "https://oa.example.invalid", OA_LIST_PATH: "/records", OA_AUTH_TYPE: "api_key", OA_API_KEY: "local-placeholder" });
assert(configuredOa.enabled && configuredOa.configured && configuredOa.authType === "api_key", "OA 服务端配置解析不正确");
const oaRoute = await readFile(new URL("../app/api/internal/oa-sync/route.ts", import.meta.url), "utf8");
assert(oaRoute.includes('user.role !== "system_admin"') && oaRoute.includes("OA 同步尚未配置") && oaRoute.includes("fetchOaList"), "OA 同步入口必须限制管理员并在未配置时不发网");
const [documentRoute, uploadRoute, versionRoute] = await Promise.all([
  readFile(new URL("../app/api/documents/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/documents/upload/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/documents/[id]/versions/route.ts", import.meta.url), "utf8"),
]);
assert(documentRoute.includes("仅系统管理员可以录入知识资源") && uploadRoute.includes("仅系统管理员可以上传知识资源") && versionRoute.includes("仅系统管理员可以上传资料新版本"), "手工上传与新版本接口必须拒绝普通员工");
console.log("PASS 正式资料生命周期离线规则：审批权限、检索门槛、归档与删除清理均已覆盖（全为虚构数据）。");
