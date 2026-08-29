// 验证管理员批量资料导入的最小安全闭环：仅检查源码与迁移约束，不读取真实资料或调用外部服务。
import { readFile } from "node:fs/promises";

async function mustContain(path: string, needles: string[]) {
  const text = await readFile(new URL(path, import.meta.url), "utf8");
  for (const needle of needles) if (!text.includes(needle)) throw new Error(`${path} 缺少预期约束：${needle}`);
}

/** 检查批次账本、上传复用链与管理员页面是否均存在，输出通过或抛出最小错误。 */
async function main() {
  await mustContain("../drizzle/0015_admin_batch_knowledge_ingestion.sql", ["knowledge_datasets", "knowledge_import_batches", "knowledge_import_items", "dataset_id", "import_batch_id"]);
  await mustContain("../app/api/knowledge-import-batches/route.ts", ["canManageFormalDocuments", "D4/机密资料不能通过当前在线批量导入入口上传", "totalCount"]);
  await mustContain("../app/api/documents/upload/route.ts", ["getBatchContext", "recordKnowledgeImportItem", "const isParsed = parseStatus === \"parsed\"", "indexApprovedDocumentVersion", "同名同大小的已入库文件，已跳过重复上传"]);
  await mustContain("../app/api/documents/[id]/route.ts", ["canManageFormalDocuments", "createdAt", "更新正式资料元数据"]);
  await mustContain("../next.config.ts", ["bodySizeLimit: \"64mb\""]);
  await mustContain("../app/page.tsx", ["/api/knowledge-import-batches", "LOCAL_TRIAL_20260828", "batchFileStatuses", "multiple accept=\".docx,.pdf,.txt,.md,.xlsx,.xls,.pptx,.ppt\"", "解析成功后自动成为正式资料", "response.status === 413"]);
  console.log("PASS 管理员批量导入：资料集、批次、逐文件结果、R2/解析复用、自动批准与运行时大小保护均已接入。");
}

void main();
