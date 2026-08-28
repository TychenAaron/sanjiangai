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

// 创建空工作区后通过现有结构化保存接口写入确定性验收正文。
// 导出验收不调用模型：本机模型允许连续正文或短暂不可用，均不能影响 Word 编号/表格能力的验证。
async function createWriting(title: string) {
  const created = await request("/api/writing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create_workspace", documentType: "通知", title, recipient: "本机虚构对象" }) });
  assert(created.status === 201, `创建虚构公文失败 HTTP ${created.status}`);
  const id = (await created.json() as { id: string }).id;
  // 说明：这份完全虚构的结构化内容专门覆盖 Word 的真实编号和表格 XML；不依赖模型是否选择 JSON 输出，也不进入知识资源。
  const structured = {
    title,
    documentType: "通知",
    recipient: "本机虚构对象",
    submittingDepartment: "本机虚构部门",
    dateLabel: "【待人工核验】",
    blocks: [
      { id: "heading-1", type: "heading", level: 1, text: "一、虚构工作说明" },
      { id: "paragraph-1", type: "paragraph", text: "本段仅用于本机结构化 Word 导出验收，不包含真实集团事实。" },
      { id: "list-1", type: "numbered_list", items: ["核对虚构事项。", "保留【待人工核验】提示。"] },
      { id: "table-1", type: "table", columns: ["阶段", "主要工作", "成果"], rows: [["准备", "整理虚构测试内容", "测试记录"], ["核验", "导出并检查 Word 结构", "【待人工核验】"]] },
      { id: "heading-2", type: "heading", level: 1, text: "二、结语" },
      { id: "paragraph-2", type: "paragraph", text: "请按本机验收流程处理。" },
    ],
  };
  const saved = await request("/api/writing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save_structured", id, structured }) });
  assert(saved.status === 200, `写入虚构结构化正文失败 HTTP ${saved.status}`);
  return id;
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
