// 本脚本使用静态与纯离线断言验证 AI 资料库正式化边界；不连接模型、OA、R2 或真实资料。
import { readFile } from "node:fs/promises";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const [schema, writingRoute, archive, rag, writingUi, gateway, exporter] = await Promise.all([
  readFile(new URL("../db/schema.ts", import.meta.url), "utf8"), readFile(new URL("../app/api/writing/route.ts", import.meta.url), "utf8"), readFile(new URL("../lib/ai-archive.ts", import.meta.url), "utf8"), readFile(new URL("../lib/rag.ts", import.meta.url), "utf8"), readFile(new URL("../app/page.tsx", import.meta.url), "utf8"), readFile(new URL("../lib/writing-model-gateway.ts", import.meta.url), "utf8"), readFile(new URL("../lib/docx-export.ts", import.meta.url), "utf8"),
]);
assert(schema.includes('sqliteTable("writing_artifacts"') && schema.includes('default("NON_FORMAL")'), "Writing Artifact 必须默认 NON_FORMAL");
assert(schema.includes('sqliteTable("formal_artifacts"') && schema.includes("knowledgeDocumentId") && schema.includes("knowledgeVersionId"), "Formal Artifact 必须关联既有正式资料版本");
assert(writingRoute.includes("createNonFormalWritingArtifact") && writingRoute.includes("formalEvidenceIds"), "成功写作必须创建私有 artifact 快照");
assert(!writingRoute.includes("documents).values") && !writingRoute.includes("documentVersions).values"), "WritingV2 不得自动进入正式知识库");
assert(archive.includes('user.role !== "system_admin"') && archive.includes('artifact.ownerUserId !== user.id'), "跨用户 artifact 访问与正式化必须受权限保护");
assert(archive.includes('status: "pending_review"') && archive.includes('versionStatus: "pending"') && archive.includes("indexDocumentVersion"), "正式化必须进入既有待审核、解析和索引链");
assert(archive.includes("formalArtifacts.sourceWritingArtifactId") && archive.includes("if (existing)"), "重复正式化必须幂等");
assert(rag.includes('eq(documents.resourceStatus, "approved")') && rag.includes('eq(documents.lifecycleStatus, "effective")') && rag.includes('ne(documents.securityLevel, "D4")'), "RAG 必须继续只读取有效 approved 正式资料");
assert(!rag.includes("writingArtifacts") && !rag.includes("formalArtifacts"), "非正式 artifact 不得进入 RAG 检索范围");
const writingV2 = writingUi.slice(writingUi.indexOf("function WritingV2()"), writingUi.indexOf("function ProjectOverview"));
for (const hidden of ["标记最终定稿", "保存草稿", "历史版本", "已生成提纲", "正式引用依据"]) assert(!writingV2.includes(hidden), `WritingV2 不得恢复 ${hidden}`);
assert(gateway.includes("privateFormatSkeletons") && gateway.includes("displayContent") && gateway.includes("if (!structured || structured.documentType !== input.documentType)") && !gateway.includes("generateStructuredWriting"), "Qwen 必须提示结构化但宽容接收连续正文");
assert(exporter.includes("hasStructuredBlocks") && exporter.includes("rawBodyXml"), "Word 必须同时支持结构化与连续正文");
console.log("AI archive formal artifact lifecycle verification passed.");
