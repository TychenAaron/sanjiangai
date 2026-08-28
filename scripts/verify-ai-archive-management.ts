// 本脚本验证 AI 资料库管理查询的权限与追溯边界；不访问网络、模型、OA 或真实资料。
import { readFile } from "node:fs/promises";
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const [list, detail, formalList, formalDetail, archive, rag, page] = await Promise.all([
  readFile(new URL("../app/api/writing/artifacts/route.ts", import.meta.url), "utf8"), readFile(new URL("../app/api/writing/artifacts/[id]/route.ts", import.meta.url), "utf8"), readFile(new URL("../app/api/formal-artifacts/route.ts", import.meta.url), "utf8"), readFile(new URL("../app/api/formal-artifacts/[id]/route.ts", import.meta.url), "utf8"), readFile(new URL("../lib/ai-archive.ts", import.meta.url), "utf8"), readFile(new URL("../lib/rag.ts", import.meta.url), "utf8"), readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
]);
assert(list.includes("pageSize") && list.includes("ownerUserId") && list.includes("contentAvailable") && list.includes("delete item.content"), "Writing Artifact 列表必须分页、筛选且不返回正文");
assert(detail.includes('artifact.ownerUserId !== user.id') && detail.includes("delete metadata.content"), "管理员不得默认读取他人私有正文");
assert(formalList.includes("formalArtifacts") && formalList.includes("pageSize"), "Formal Artifact 列表必须分页");
for (const field of ["sourceWritingArtifactId", "knowledgeDocumentId", "knowledgeVersionId", "approvalStatus", "reliabilityScore", "securityLevel", "indexStatus"]) assert(formalDetail.includes(field), `Formal Artifact 详情缺少 ${field}`);
assert(archive.includes('status: "pending_review"') && archive.includes('versionStatus: "pending"') && archive.includes("if (existing)"), "正式化必须待审核且幂等");
assert(rag.includes('eq(documents.resourceStatus, "approved")') && rag.includes('eq(documents.lifecycleStatus, "effective")') && !rag.includes("writingArtifacts"), "NON_FORMAL 不得进入 RAG，正式资料须通过生命周期过滤");
const writingV2 = page.slice(page.indexOf("function WritingV2()"), page.indexOf("function ProjectOverview"));
for (const hidden of ["标记最终定稿", "正式引用依据", "历史版本", "保存草稿", "已生成提纲"]) assert(!writingV2.includes(hidden), `WritingV2 不得显示 ${hidden}`);
console.log("AI archive management verification passed.");
