// 本文件用于请求已启动的 localhost 开发服务器，验证虚构文本的禁止词条、上传、审核和资料权限闭环。
// 它只使用 .sanjiang.test 测试身份、local D1、local R2 和 scripts/fixtures 下的两份虚构 .txt 文件，不访问线上资源。
import { readFile } from "node:fs/promises";

const baseUrl = process.env.LOCAL_TEST_BASE_URL || "http://localhost:5173";
const blockedFile = new URL("./fixtures/local-upload-blocked.txt", import.meta.url);
const allowedFile = new URL("./fixtures/local-upload-allowed.txt", import.meta.url);
let cookie = "";

// 说明：发送本机接口请求并保存 HttpOnly Cookie，输入为路径和请求选项，输出为 HTTP 响应。
async function localRequest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";", 1)[0];
  return response;
}

function assertStatus(actual: number, expected: number, label: string) {
  if (actual !== expected) throw new Error(`${label}：期望 HTTP ${expected}，实际 HTTP ${actual}`);
  console.log(`PASS ${label}: HTTP ${actual}`);
}

// 说明：用两份固定虚构文本构造 multipart 上传请求，输出为上传接口响应。
async function uploadFixture(fileUrl: URL, securityLevel: string) {
  const content = await readFile(fileUrl);
  const form = new FormData();
  form.set("file", new File([content], fileUrl.pathname.split("/").pop() || "local-test.txt", { type: "text/plain" }));
  form.set("title", `本机上传验证-${securityLevel}`);
  form.set("documentType", "本机测试资料");
  form.set("trialDataClass", securityLevel === "公开" ? "T1-公开资料" : "T2-内部脱敏测试");
  form.set("securityLevel", securityLevel);
  form.set("permissionScope", "公司全员");
  form.set("confirmedDesensitized", "true");
  return localRequest("/api/documents/upload", { method: "POST", body: form });
}

const rule = "LOCAL_UPLOAD_BLOCK_TOKEN";
let response = await localRequest("/api/blocked-terms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ term: rule, category: "本机虚构验证", matchScope: "content", note: "仅本机上传验证" }) });
if (response.status !== 201 && response.status !== 409) assertStatus(response.status, 201, "新增虚构禁止词条");
else console.log(`PASS 虚构禁止词条已可用: HTTP ${response.status}`);

response = await uploadFixture(blockedFile, "内部");
assertStatus(response.status, 400, "命中禁止词条的文本被拒绝");

response = await uploadFixture(allowedFile, "内部");
assertStatus(response.status, 201, "未命中词条的文本进入待审核");
const uploaded = (await response.json()) as { document?: { id?: string; knowledgeStatus?: string } };
if (!uploaded.document?.id || uploaded.document.knowledgeStatus !== "pending") throw new Error("未命中词条的资料没有创建待审核记录");
console.log("PASS 上传资料状态: pending，并已创建资料记录");

response = await localRequest("/api/local-test/accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "switch", account: "staff" }) });
assertStatus(response.status, 200, "切换到本机普通员工");
response = await uploadFixture(allowedFile, "敏感");
assertStatus(response.status, 403, "普通员工上传敏感资料被拒绝");
response = await uploadFixture(allowedFile, "机密");
assertStatus(response.status, 403, "机密资料在线上传被明确拒绝");
const confidentialBody = (await response.json()) as { error?: string };
if (confidentialBody.error !== "机密资料不得通过当前在线上传入口提交，应按后续机密资料专用流程处理") throw new Error("机密资料拒绝提示不符合安全要求");

response = await localRequest("/api/local-test/accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "clear" }) });
assertStatus(response.status, 200, "清除普通员工 Cookie 并恢复管理员");
response = await localRequest(`/api/documents/${uploaded.document.id}/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: "approve", comment: "本机虚构资料审核通过" }) });
assertStatus(response.status, 200, "系统管理员审核待审核资料");
const approval = (await response.json()) as { status?: string };
if (approval.status !== "approved") throw new Error("系统管理员审核后资料未变为 approved");
console.log("PASS 审核结果: approved");

response = await localRequest("/api/documents");
assertStatus(response.status, 200, "管理员读取资料列表");
const records = (await response.json()) as { documents?: Array<{ id: string; knowledgeStatus: string }> };
if (!records.documents?.some((item) => item.id === uploaded.document?.id && item.knowledgeStatus === "approved")) throw new Error("审核通过的资料未出现在管理员资料列表");
console.log("PASS 审核通过资料已进入管理员资料列表");
