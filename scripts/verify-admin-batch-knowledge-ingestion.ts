// 验证管理员批量资料导入的最小安全闭环：仅检查源码与迁移约束，不读取真实资料或调用外部服务。
import { readFile } from "node:fs/promises";

async function mustContain(path: string, needles: string[]) {
  const text = await readFile(new URL(path, import.meta.url), "utf8");
  for (const needle of needles) if (!text.includes(needle)) throw new Error(`${path} 缺少预期约束：${needle}`);
}

/** 检查批次账本、上传复用链与管理员页面是否均存在，输出通过或抛出最小错误。 */
async function main() {
  await mustContain("../drizzle/0015_admin_batch_knowledge_ingestion.sql", ["knowledge_datasets", "knowledge_import_batches", "knowledge_import_items", "dataset_id", "import_batch_id"]);
  await mustContain("../app/api/knowledge-import-batches/route.ts", ["user.role !== \"system_admin\"", "D4/机密资料不能通过当前在线批量导入入口上传", "totalCount"]);
  await mustContain("../app/api/documents/upload/route.ts", ["getBatchContext", "recordKnowledgeImportItem", "pending_review", "indexDocumentVersion", "同名同大小的已入库文件，已跳过重复上传"]);
  await mustContain("../app/page.tsx", ["/api/knowledge-import-batches", "LOCAL_TRIAL_20260828", "batchFileStatuses", "multiple accept=\".docx,.pdf,.txt,.md,.xlsx,.xls,.pptx,.ppt\"", "文件过大 / 已跳过（单文件最大 8MB）", "response.status === 413", "文件超过单文件大小限制（单文件最大 8MB）"]);
  console.log("PASS 管理员批量导入：资料集、批次、逐文件结果、R2/解析复用与待审核门槛均已接入。");
}

void main();
