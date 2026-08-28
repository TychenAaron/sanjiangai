// 本脚本离线验证 WritingV2 的正式 RAG 知识注入：仅使用虚构文本与静态源码断言，不连接 D1、R2、模型、OA 或网络。
import { readFile } from "node:fs/promises";
import { buildWritingMessages, type WritingGenerationInput } from "../lib/writing-model-gateway.ts";

function assertTrue(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

const formalEvidence = {
  documentId: "formal-allowed", versionId: "formal-v3", title: "虚构正式盘点制度", category: "制度规范",
  sourceOrganization: "虚构来源单位", documentDate: "2026-01-01", version: 3, excerpt: "【formal-allowed】虚构正式制度要求登记复核记录。",
  sourceType: "manual", chunkIndex: 2, location: "第3段", score: 0.98,
};
const base: WritingGenerationInput = {
  documentType: "通知", title: "虚构盘点工作通知", recipient: "虚构接收对象", submittingDepartment: "虚构部门",
  facts: "用户确认：本机测试需要整理盘点记录。", referenceQuery: "虚构盘点复核安排", references: [formalEvidence],
  privateReferenceGuidance: [{ format: "docx", excerpt: "【private-current-task】用户私有背景：请以正式通知语气组织盘点安排。", locations: ["第1段"] }],
};

// CASE 1：私有材料与正式 Top Evidence 均进入不同 context 层，正式证据保留可追溯主键。
const mixed = JSON.stringify(buildWritingMessages(base));
assertTrue(mixed.includes("[WRITING_REQUIREMENTS]") && mixed.includes("[PRIVATE_REFERENCES]") && mixed.includes("[FORMAL_KNOWLEDGE_EVIDENCE]"), "写作 context 必须分层");
assertTrue(mixed.includes("private-current-task") && mixed.includes("formal-allowed") && mixed.includes("formal-v3") && mixed.includes("第3段"), "私有材料和正式 evidence 必须分别保留必要信息");
// CASE 2：没有私有参考时，正式 evidence 仍可独立进入写作 context。
const formalOnly = JSON.stringify(buildWritingMessages({ ...base, privateReferenceGuidance: [] }));
assertTrue(!formalOnly.includes("private-current-task") && formalOnly.includes("formal-allowed"), "无私有参考时仍必须使用正式 evidence");
// CASE 3：没有正式 evidence 时仍可写作，但必须明确没有正式知识层内容。
const privateOnly = JSON.stringify(buildWritingMessages({ ...base, references: [] }));
assertTrue(privateOnly.includes("private-current-task") && !privateOnly.includes("formal-allowed"), "无正式知识时必须继续保留私有材料且不注入正式 evidence");

const [writingSource, routeSource, pageSource, privateRoute, exportRoute, ragSource] = await Promise.all([
  readFile(new URL("../lib/writing.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/writing/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/api/writing/[id]/private-references/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/writing/[id]/export/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/rag.ts", import.meta.url), "utf8"),
]);
// CASE 4/5/6：写作必须复用完整 RAG，而完整 RAG 在权限、D4、版本、生命周期前置后才会形成 Top Evidence。
for (const required of ["retrieveAuthorizedRerankedHybrid", "buildWritingKnowledgeQuery", "resolveWritingKnowledge"]) assertTrue(writingSource.includes(required), `WritingV2 未复用完整 RAG：${required}`);
assertTrue(writingSource.includes("[input.documentType, input.title, input.recipient, input.referenceQuery, input.facts]") && writingSource.includes(".slice(0, 500)"), "写作知识查询必须只使用任务字段且有长度上限");
for (const required of ["document.securityLevel !== \"D4\"", "document.currentVersion === versionNo", "canReadDocument(user, row.document, grants)", "selectTopEvidence"]) assertTrue(ragSource.includes(required), `正式知识过滤缺失：${required}`);
assertTrue(routeSource.includes("writeWritingKnowledgeAudit") && routeSource.includes("formalKnowledgeUsed="), "写作任务必须保留最小知识注入审计");
// CASE 7/8：Embedding 与 Reranker 故障由已有 RAG 内部降级，WritingV2 不得另建或阻断写作链。
assertTrue(ragSource.includes('status: vector.status === "success" ? "hybrid" : "keyword_only"') && ragSource.includes("rerankerUsed: false"), "WritingV2 复用的 RAG 降级链不完整");
// CASE 9：私有参考保持当前工作区/R2 隔离，不进入公共 documents 检索或其他用户范围。
assertTrue(privateRoute.includes("writing-references/") && privateRoute.includes("writingDocumentId") && !writingSource.includes("writingPrivateReferences"), "私有参考材料边界被破坏");
// CASE 10/11：仅检查 WritingV2 组件，其他知识资源页面的“保存草稿”等文字不属于写作 UI。
const writingV2Start = pageSource.indexOf("function WritingV2()");
const writingV2End = pageSource.indexOf("function ProjectOverview", writingV2Start);
const writingV2Source = pageSource.slice(writingV2Start, writingV2End);
assertTrue(writingV2Start >= 0 && writingV2End > writingV2Start, "无法定位 WritingV2 组件");
for (const forbidden of ["正式引用依据", "已生成提纲", "历史版本", "保存草稿", "标记最终定稿", "自动保存"]) assertTrue(!writingV2Source.includes(forbidden), `WritingV2 UI 不得恢复：${forbidden}`);
// CASE 12：Word 导出仍走既有导出模块，并明确不查询私有参考。
assertTrue(exportRoute.includes("createWritingDocx") && exportRoute.includes("私有参考材料不在此查询"), "Word 导出边界不应回归");

console.log("Writing RAG integration verification passed.");
