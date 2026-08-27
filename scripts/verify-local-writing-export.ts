// 本脚本通过已运行的 localhost 服务验证虚构公文可重复导出、权限隔离和知识库零写入；不启动服务、不上传文件或调用模型。
import { strFromU8, unzipSync } from "fflate";

const baseUrl = process.env.LOCAL_TEST_BASE_URL || "http://localhost:5173";
let cookie = "";

async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";", 1)[0];
  return response;
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

// 创建只含虚构事实的公文；服务端在创建时生成结构化正文，不需要标记最终定稿。
async function createWriting(title: string) {
  const created = await request("/api/writing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create", documentType: "通知", title, recipient: "本机虚构对象", facts: "本机虚构事实，仅用于导出验证。", referenceQuery: "ZXCVB9876" }) });
  assert(created.status === 201, `创建虚构公文失败 HTTP ${created.status}`);
  return (await created.json() as { id: string }).id;
}

// 说明：创建人可在生成正文后多次导出；DOCX 必须包含真正的编号、表格 XML，且不依赖最终定稿状态。
let response = await request("/api/local-test/accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "switch", account: "staff" }) });
assert(response.status === 200, "切换普通员工失败");
const staffTitle = "本机虚构导出通知";
const staffId = await createWriting(staffTitle);
for (let index = 0; index < 2; index += 1) {
  response = await request(`/api/writing/${staffId}/export`);
  assert(response.status === 200, `创建人第 ${index + 1} 次导出失败 HTTP ${response.status}`);
  const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const xml = strFromU8(archive["word/document.xml"]);
  assert(archive["word/numbering.xml"] && xml.includes("<w:numPr>") && xml.includes("<w:tbl>"), "DOCX 未包含 Word 编号或真实表格 XML");
  assert(xml.includes(staffTitle), "DOCX 未包含虚构标题");
}
console.log("PASS 创建人可在生成正文后重复导出结构化 DOCX");

// 说明：空工作区尚无正文，服务端必须拒绝导出，避免下载没有正文的空文档。
const empty = await request("/api/writing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create_workspace", documentType: "通知", title: "本机虚构空工作区" }) });
assert(empty.status === 201, "创建空工作区失败");
const emptyId = (await empty.json() as { id: string }).id;
response = await request(`/api/writing/${emptyId}/export`);
assert(response.status === 409, `空工作区应拒绝导出，实际 HTTP ${response.status}`);
console.log("PASS 空工作区不能导出 Word");

// 说明：普通员工不能导出他人工作区；系统管理员可导出全部，且所有写作工作区均不进入 documents 知识库。
response = await request("/api/local-test/accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "clear" }) });
assert(response.status === 200, "恢复管理员失败");
const adminId = await createWriting("本机虚构管理员通知");
response = await request("/api/local-test/accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "switch", account: "staff" }) });
assert(response.status === 200, "再次切换普通员工失败");
response = await request(`/api/writing/${adminId}/export`);
assert(response.status === 403, `普通员工不得导出他人公文，实际 HTTP ${response.status}`);
response = await request("/api/local-test/accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "clear" }) });
assert(response.status === 200, "第二次恢复管理员失败");
response = await request(`/api/writing/${staffId}/export`);
assert(response.status === 200, `系统管理员导出其他人公文失败 HTTP ${response.status}`);
response = await request("/api/documents");
const documents = await response.json() as { documents: Array<{ id: string }> };
assert(!documents.documents.some((document) => [staffId, emptyId, adminId].includes(document.id)), "写作工作区不得自动进入 documents 知识库");
console.log("PASS 权限隔离和知识资源零写入正确");
