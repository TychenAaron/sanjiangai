// 验证正式知识上传的自动批准约束：不读取真实资料、不访问网络，只检查上传、新版本、迁移和 RAG 过滤的源代码契约。
import { readFile } from "node:fs/promises";

/** 读取指定源文件并确认全部约束文本存在；失败时只报告缺失的安全契约。 */
async function mustContain(path: string, needles: string[]) {
  const text = await readFile(new URL(path, import.meta.url), "utf8");
  for (const needle of needles) {
    if (!text.includes(needle)) throw new Error(`${path} 缺少预期约束：${needle}`);
  }
  return text;
}

/** 核验上传即批准、待解析不入 RAG、历史修复和角色限制是否同时成立。 */
async function main() {
  const upload = await mustContain("../app/api/documents/upload/route.ts", [
    'const isParsed = parseStatus === "parsed"',
    'resourceStatus: "approved"',
    'knowledgeStatus: "approved"',
    'versionStatus: "approved"',
    'status: "approved"',
    'indexStatus: isParsed ? "ready" : "pending"',
    'const vectorResult = isParsed ? await indexApprovedDocumentVersion',
    "canManageFormalDocuments(user)",
  ]);
  if (upload.includes("automaticallyApproved") || upload.includes('resourceStatus: isParsed ? "approved" : "pending_review"')) {
    throw new Error("上传路由仍把待解析文件写为待审核");
  }
  const textEntry = await mustContain("../app/api/documents/route.ts", [
    'const status = "approved"',
    "lifecycleStatus: \"effective\"",
    "reliabilityScore: 0",
    "canManageFormalDocuments(user)",
  ]);
  if (textEntry.includes("reliabilityScore: 60")) throw new Error("手工录入仍要求可靠性评分");
  const version = await mustContain("../app/api/documents/[id]/versions/route.ts", [
    'versionStatus: "approved"',
    'lifecycleStatus: "effective"',
    "reliabilityScore: 0",
    "canManageFormalDocuments(user)",
  ]);
  if (version.includes("reliabilityScore: 60")) throw new Error("新版本仍要求可靠性评分");
  await mustContain("../drizzle/0018_auto_approve_uploaded_documents.sql", [
    "source_type = '文件上传'",
    "resource_status = 'approved'",
    "knowledge_status = 'approved'",
    "lifecycle_status = 'effective'",
    "reliability_score = 0",
    "document_versions",
    "approvals",
  ]);
  await mustContain("../lib/rag.ts", [
    'document.parseStatus === "parsed"',
    'document.indexStatus === "ready"',
    'document.knowledgeStatus === "approved"',
    'document.lifecycleStatus === "effective"',
  ]);
  const page = await mustContain("../app/page.tsx", ["上传、解析并自动入库", "保存并自动入库", '"待 OCR"']);
  if (page.includes("上传、解析并提交审核") || page.includes("保存并提交审核")) throw new Error("知识资源上传页面仍展示人工审核文案");
  console.log("PASS 知识资源上传自动批准：单文件、批量、新版本均自动 approved/effective/current；待 OCR/待转换仅延迟索引，不进入 RAG。");
}

void main();
