// 本脚本在已启动的本机开发服务上验证虚构正式资料的受控批量上传：单份失败不会阻断后续文件，重复文件不会再次写入，成功记录会在结束时清理。
import { readFile } from "node:fs/promises";

const baseUrl = process.env.LOCAL_TEST_BASE_URL || "http://localhost:5173";
const createdDocumentIds: string[] = [];

/**
 * 调用本机正式资料上传接口。输入为完全虚构的文件及标题，输出为 HTTP 响应和成功记录 ID；仅使用默认本地管理员身份。
 */
async function upload(file: File, title: string) {
  const form = new FormData();
  form.set("file", file);
  form.set("title", title);
  form.set("documentType", "本机批量验收资料");
  form.set("trialDataClass", "T2-内部脱敏测试");
  form.set("securityLevel", "内部");
  form.set("permissionScope", "责任部门");
  form.set("confirmedDesensitized", "true");
  form.set("resourceCategory", "其他");
  return fetch(`${baseUrl}/api/documents/upload`, { method: "POST", body: form });
}

/**
 * 断言 HTTP 状态。输入为实际和预期状态，输出为无返回值；失败时停止验证以防误判批量安全行为。
 */
function expectStatus(response: Response, expected: number, label: string) {
  if (response.status !== expected) throw new Error(`${label}: expected HTTP ${expected}, received ${response.status}`);
  console.log(`PASS ${label}: HTTP ${expected}`);
}

try {
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  if (!pageSource.includes("multiple accept=\".docx,.pdf,.txt,.md,.xlsx,.xls,.pptx,.ppt\"") || !pageSource.includes("for (const file of uploadFiles)")) {
    throw new Error("页面未保留多文件选择和逐文件上传控制");
  }

  const invalid = await upload(new File(["本机虚构无效文件"], "batch-invalid.exe", { type: "application/octet-stream" }), "本机虚构无效文件");
  expectStatus(invalid, 400, "不支持格式被单独拒绝");

  const firstFile = new File(["本机虚构批量资料 A\n仅用于上传验收。"], "batch-virtual-a.txt", { type: "text/plain" });
  const first = await upload(firstFile, "本机虚构批量资料 A");
  expectStatus(first, 201, "前一份失败后后续文件仍可入库");
  const firstBody = await first.json() as { document?: { id?: string; knowledgeStatus?: string } };
  if (!firstBody.document?.id || firstBody.document.knowledgeStatus !== "pending") throw new Error("成功文件未进入待审核正式资料生命周期");
  createdDocumentIds.push(firstBody.document.id);

  const duplicate = await upload(firstFile, "本机虚构批量资料 A");
  expectStatus(duplicate, 409, "同名同大小文件被拒绝重复入库");

  const changed = await upload(new File(["本机虚构批量资料 A\n内容已变更。"], "batch-virtual-a.txt", { type: "text/plain" }), "本机虚构批量资料 A");
  expectStatus(changed, 201, "同名内容变化文件可独立进入待审核");
  const changedBody = await changed.json() as { document?: { id?: string; knowledgeStatus?: string } };
  if (!changedBody.document?.id || changedBody.document.knowledgeStatus !== "pending") throw new Error("内容变化文件未独立进入待审核生命周期");
  createdDocumentIds.push(changedBody.document.id);
  console.log("PASS 批量逐文件控制：失败不阻断、成功与失败可分别汇总。");
} finally {
  for (const documentId of createdDocumentIds) {
    const response = await fetch(`${baseUrl}/api/documents/${documentId}/lifecycle`, { method: "DELETE" });
    if (!response.ok) throw new Error(`无法清理本机虚构验证资料：${documentId}`);
  }
}
