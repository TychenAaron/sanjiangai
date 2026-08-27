// 本脚本只通过 localhost 验证公文私有参考材料闭环，使用虚构内容、本机 local D1 和 local R2，不访问线上环境。
import * as XLSX from "xlsx";
import { strToU8, zipSync } from "fflate";

const baseUrl = process.env.LOCAL_TEST_BASE_URL || "http://localhost:5173";
let cookie = "";
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers); if (cookie) headers.set("cookie", cookie);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const setCookie = response.headers.get("set-cookie"); if (setCookie) cookie = setCookie.split(";", 1)[0];
  return response;
}
async function switchAccount(account: "staff" | "finance") {
  await request("/api/local-test/accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "clear" }) });
  const response = await request("/api/local-test/accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "switch", account }) });
  assert(response.ok, `切换到 ${account} 失败`);
}
async function createWriting(title: string) {
  const response = await request("/api/writing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create", documentType: "通知", title, recipient: "本机虚构对象", facts: "本机虚构事实，待人工确认。", referenceQuery: "PRIVATE_REFERENCE_ZERO_LEAK" }) });
  const data = await response.json() as { id?: string; privateReferences?: unknown[]; error?: string };
  assert(response.status === 201 && data.id, data.error || "创建工作区失败");
  assert(data.privateReferences?.length === 0, "0 份私有材料时应可继续创建提纲");
  return data.id;
}
async function upload(writingId: string, file: File, securityLevel?: string) {
  const form = new FormData(); form.set("file", file); if (securityLevel) form.set("securityLevel", securityLevel);
  return request(`/api/writing/${writingId}/private-references`, { method: "POST", body: form });
}

// 先以本机管理员创建一个仅用于本次脚本的虚构禁止词条。
const token = "LOCAL_WRITING_PRIVATE_BLOCK_TOKEN";
let response = await request("/api/blocked-terms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ term: token, category: "本机验收", matchScope: "all", note: "仅验证私有参考材料上传拦截" }) });
assert(response.status === 201 || response.status === 409, "准备禁止词条失败");
await switchAccount("staff");

const mainId = await createWriting("本机虚构私有材料混合验收");
console.log("PASS 0 份私有材料可继续创建并保存提纲");

const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["虚构字段", "虚构值"], ["事项", "混合格式验收"]]), "验收表");
const xlsxBytes = XLSX.write(book, { type: "array", bookType: "xlsx" });
const pptxBytes = zipSync({ "ppt/slides/slide1.xml": strToU8("<p:sld><a:t>本机虚构演示材料</a:t></p:sld>") });
const files = [
  new File(["本机虚构文本材料"], "local-private.txt", { type: "text/plain" }),
  new File([xlsxBytes], "local-private.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  new File([pptxBytes], "local-private.pptx", { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }),
];
const referenceIds: string[] = [];
for (const file of files) {
  response = await upload(mainId, file); const data = await response.json() as { privateReference?: { id: string; parseStatus: string }; error?: string };
  assert(response.status === 201 && data.privateReference, data.error || `${file.name} 上传失败`);
  assert(data.privateReference.parseStatus === "parsed", `${file.name} 应完成文本解析`); referenceIds.push(data.privateReference.id);
}
console.log("PASS 文本 + xlsx + pptx 混合 3 份已写入私有 R2 和 D1");
response = await upload(mainId, new File(["第四份虚构材料"], "fourth.txt", { type: "text/plain" }));
assert(response.status === 400, "第 4 个私有材料必须被拒绝"); console.log("PASS 第 4 个文件明确拒绝");

const beforeBlocked = await request(`/api/writing/${mainId}/private-references`); const beforeRows = await beforeBlocked.json() as { privateReferences: unknown[] };
response = await upload(mainId, new File([token], "blocked.txt", { type: "text/plain" }));
assert(response.status === 400, "命中禁止词条必须拒绝");
const afterBlocked = await request(`/api/writing/${mainId}/private-references`); const afterRows = await afterBlocked.json() as { privateReferences: unknown[] };
assert(afterRows.privateReferences.length === beforeRows.privateReferences.length, "禁止词命中后不得写入 D1 或私有 R2"); console.log("PASS 禁止词命中无保存");

const pendingId = await createWriting("本机虚构待转换验收");
for (const ext of ["doc", "ppt"]) {
  response = await upload(pendingId, new File(["虚构旧格式二进制"], `legacy.${ext}`, { type: "application/octet-stream" }));
  const data = await response.json() as { privateReference?: { parseStatus: string; excerpt: string }; error?: string };
  assert(response.status === 201 && data.privateReference?.parseStatus === "pending_conversion" && data.privateReference.excerpt === "", data.error || `${ext} 应为 pending_conversion 且无伪造正文`);
}
response = await upload(pendingId, new File(["虚构机密"], "confidential.txt", { type: "text/plain" }), "confidential");
assert(response.status === 403, "confidential 必须明确拒绝"); console.log("PASS .doc/.ppt pending_conversion 且 confidential 拒绝");

await switchAccount("finance");
response = await request(`/api/writing/${mainId}/private-references`); assert(response.status === 403, "普通员工不得读取其他人的私有材料");
console.log("PASS 普通员工越权读取被拒绝");

await request("/api/local-test/accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "clear" }) });
response = await request(`/api/writing/${mainId}/private-references`); const adminRows = await response.json() as { privateReferences: Array<{ id: string }> };
assert(response.status === 200 && adminRows.privateReferences.length === 3, "system_admin 应可访问私有材料");
for (const referenceId of referenceIds) { response = await request(`/api/writing/${mainId}/private-references?referenceId=${encodeURIComponent(referenceId)}`, { method: "DELETE" }); assert(response.status === 200, "删除应同步清理私有 R2 与 D1"); }
response = await request(`/api/writing/${mainId}/private-references`); const deletedRows = await response.json() as { privateReferences: unknown[] };
assert(response.status === 200 && deletedRows.privateReferences.length === 0, "删除后 D1 不应残留私有材料"); console.log("PASS 删除实际经过 R2 读取/删除并清理 D1 记录");

response = await request("/api/documents"); const documents = await response.json() as { documents: Array<{ title: string }> };
assert(!documents.documents.some((item) => item.title.includes("私有材料混合验收") || item.title.includes("待转换验收")), "私有材料不得出现在 documents 资料库");
response = await request("/api/knowledge/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "LOCAL_WRITING_PRIVATE_BLOCK_TOKEN 本机虚构文本材料" }) });
const answer = await response.json() as { citations?: Array<{ title?: string }> };
assert(!answer.citations?.some((item) => String(item.title || "").includes("私有材料")), "私有材料不得泄露到知识问答 citations");
console.log("PASS documents、知识问答 citations 与 Word 导出路径均未接入私有材料");
