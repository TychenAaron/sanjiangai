// 在已启动的本机服务上验证管理员批量导入 HTTP 闭环；仅创建完全虚构的临时文本并在结束时归档清理。
const baseUrl = process.env.LOCAL_TEST_BASE_URL || "http://localhost:5173";
let documentId = "";

function expectStatus(actual: number, expected: number, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
  console.log(`PASS ${label}`);
}

/** 创建虚构批次、逐项上传并核对服务端持久化汇总；不使用用户资料或外部服务。 */
async function main() {
  const create = await fetch(`${baseUrl}/api/knowledge-import-batches`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    datasetName: "VERIFY_ADMIN_BATCH_20260828", totalCount: 3, documentType: "其他资料", resourceCategory: "其他", securityLevel: "D2", permissionScope: "责任部门", ownerDepartment: "集团办公室", trialDataClass: "T2-内部脱敏测试",
  }) });
  expectStatus(create.status, 201, "管理员可创建持久化导入批次");
  const { batch } = await create.json() as { batch: { id: string } };
  const upload = async (file: File, key: string) => { const form = new FormData(); form.set("file", file); form.set("title", file.name.replace(/\.[^.]+$/, "")); form.set("confirmedDesensitized", "true"); form.set("batchId", batch.id); form.set("batchItemKey", key); return fetch(`${baseUrl}/api/documents/upload`, { method: "POST", body: form }); };
  const file = new File(["完全虚构的管理员批次验收正文。用于验证文档、版本、分段和自动批准生命周期。"], `verify-admin-batch-${crypto.randomUUID()}.txt`, { type: "text/plain" });
  const first = await upload(file, "first"); expectStatus(first.status, 201, "成功文件进入自动批准正式资料链路");
  const firstBody = await first.json() as { document: { id: string; datasetId: string; importBatchId: string; resourceStatus: string; knowledgeStatus: string; reliabilityScore: number; createdAt: string }; chunkCount: number };
  if (!firstBody.document.id || !firstBody.document.datasetId || firstBody.document.importBatchId !== batch.id || firstBody.document.resourceStatus !== "approved" || firstBody.document.knowledgeStatus !== "approved" || firstBody.document.reliabilityScore !== 60 || !firstBody.document.createdAt || firstBody.chunkCount < 1) throw new Error("成功文件未持久化资料集、批次、自动批准状态、系统默认可靠性或分段");
  documentId = firstBody.document.id;
  const switched = await fetch(`${baseUrl}/api/local-test/accounts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "switch", account: "staff" }) });
  const staffCookie = switched.headers.get("set-cookie")?.split(";", 1)[0] || "";
  const forbiddenVersion = await fetch(`${baseUrl}/api/documents/${documentId}/versions`, { method: "POST", headers: { "Content-Type": "application/json", ...(staffCookie ? { cookie: staffCookie } : {}) }, body: JSON.stringify({ content: "虚构越权新版本" }) }); expectStatus(forbiddenVersion.status, 403, "普通员工不能创建正式资料新版本");
  const forbiddenMetadata = await fetch(`${baseUrl}/api/documents/${documentId}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(staffCookie ? { cookie: staffCookie } : {}) }, body: JSON.stringify({ resourceCategory: "越权修改" }) }); expectStatus(forbiddenMetadata.status, 403, "普通员工不能修改正式资料元数据");
  const metadata = await fetch(`${baseUrl}/api/documents/${documentId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resourceCategory: "虚构验收资料", createdAt: "2000-01-01T00:00:00.000Z" }) }); expectStatus(metadata.status, 200, "资料管理角色可修改允许的资料元数据");
  const metadataBody = await metadata.json() as { document: { resourceCategory: string; createdAt: string } };
  if (metadataBody.document.resourceCategory !== "虚构验收资料" || metadataBody.document.createdAt !== firstBody.document.createdAt) throw new Error("元数据更新不应接受客户端覆盖上传时间");
  const duplicate = await upload(file, "duplicate"); expectStatus(duplicate.status, 409, "重复文件被跳过且不重复写入");
  const invalid = new FormData(); invalid.set("file", new File(["虚构无效文件"], "verify-admin-batch.exe", { type: "application/octet-stream" })); invalid.set("confirmedDesensitized", "true"); invalid.set("batchId", batch.id); invalid.set("batchItemKey", "invalid");
  const invalidResponse = await fetch(`${baseUrl}/api/documents/upload`, { method: "POST", body: invalid }); expectStatus(invalidResponse.status, 400, "单文件预检失败不终止批次");
  const complete = await fetch(`${baseUrl}/api/knowledge-import-batches/${batch.id}`, { method: "POST" }); expectStatus(complete.status, 200, "服务端完成并重算批次汇总");
  const detail = await fetch(`${baseUrl}/api/knowledge-import-batches/${batch.id}`); expectStatus(detail.status, 200, "管理员可读取批次结果");
  const data = await detail.json() as { batch: { successCount: number; failedCount: number; skippedCount: number; status: string }; items: Array<{ status: string; documentId?: string; reason?: string; storageKey?: string }> };
  if (data.batch.successCount !== 1 || data.batch.failedCount !== 1 || data.batch.skippedCount !== 1 || data.batch.status !== "completed") throw new Error("批次成功、失败、跳过汇总不正确");
  if (data.items.some((item) => "storageKey" in item) || !data.items.some((item) => item.status === "succeeded" && item.documentId) || !data.items.some((item) => item.status === "failed" && item.reason)) throw new Error("逐文件结果泄漏存储键或缺少结果信息");
  console.log("PASS 单文件失败不影响整批，且批次结果不泄漏原文或 R2 key");
}

try { await main(); } finally { if (documentId) { const cleanup = await fetch(`${baseUrl}/api/documents/${documentId}/lifecycle`, { method: "DELETE" }); if (!cleanup.ok) throw new Error("无法清理本机虚构批次验收资料"); } }
