// 本脚本离线核验政策候选的幂等、审核权限和正式知识待审核边界；不连接网络、模型或真实资料。
import { readFile } from "node:fs/promises";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const [service, listRoute, detailRoute, reviewRoute, rag] = await Promise.all([
  readFile(new URL("../lib/policy-candidates.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/policy-candidates/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/policy-candidates/[id]/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/policy-candidates/[id]/review/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/rag.ts", import.meta.url), "utf8"),
]);

// 相同来源、标题和内容哈希必须复用已有候选；内容变化则不会命中该确定性条件。
assert(
  service.includes("policyCandidates.contentHash") &&
    service.includes("if (existing) return { candidate: existing, created: false }"),
  "重复政策候选必须按来源、标题和内容哈希幂等返回",
);
assert(
  service.includes('status: "PENDING_REVIEW"') && service.includes("crypto.subtle.digest"),
  "新内容必须创建待审核候选并计算确定性内容哈希",
);

// 复核操作仅由系统管理员执行，普通员工不能批准或拒绝。
assert(
  service.includes('user.role !== "system_admin"') && reviewRoute.includes("reviewPolicyCandidate"),
  "候选审核必须在服务层重新执行管理员权限校验",
);

// 候选批准只建立现有正式资料的待审核版本，绝不能直接变为正式可检索依据。
assert(
  service.includes('resourceStatus: "pending_review"') &&
    service.includes('versionStatus: "pending"') &&
    service.includes('status: "pending"'),
  "候选批准只能创建 pending_review 正式资料和 pending 审批",
);
assert(
  rag.includes('eq(documents.resourceStatus, "approved")') &&
    rag.includes('eq(documents.lifecycleStatus, "effective")'),
  "RAG 必须仅接纳现有生命周期已批准且生效的正式资料",
);

// 列表和详情均保留最小管理查询能力，详情的 RAG 状态必须来自正式资料真状态。
for (const filter of ["status", "source", "documentNumber", "pageSize"]) {
  assert(listRoute.includes(`searchParams.get("${filter}")`) || listRoute.includes(filter), `候选列表缺少 ${filter} 筛选或分页`);
}
assert(
  detailRoute.includes("policySource") &&
    detailRoute.includes("knowledgeDocumentId") &&
    detailRoute.includes("knowledgeVersionId") &&
    detailRoute.includes("isFormalEvidenceDocument"),
  "候选详情必须返回来源、正式资料关联和基于正式生命周期的 RAG 状态",
);

console.log("Policy candidate lifecycle minimal verification passed.");
