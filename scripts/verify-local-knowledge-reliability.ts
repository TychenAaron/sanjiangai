// 本文件用于验证 localhost 下虚构已审核资料的可靠依据门槛、分片定位和权限过滤。
// 它不配置模型地址或密钥，只验证没有模型时的 extractive 与 no_basis 返回，不访问线上服务。
const baseUrl = process.env.LOCAL_TEST_BASE_URL || "http://localhost:5173";
let cookie = "";

// 说明：发送仅指向 localhost 的请求并保存本机 HttpOnly 测试 Cookie，输出为接口响应。
async function localRequest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";", 1)[0];
  return response;
}

type KnowledgeResult = {
  answer: string;
  mode: "qwen" | "extractive" | "no_basis";
  citations: Array<{ title: string; excerpt: string; chunkIndex: number; location: string }>;
};

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

// 说明：以当前本机身份提问，输出问答结果；脚本只接受本机关卡已建立的虚构测试身份。
async function ask(query: string) {
  const response = await localRequest("/api/knowledge/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  assert(response.status === 200, `知识问答请求失败：HTTP ${response.status}`);
  return response.json() as Promise<KnowledgeResult>;
}

let result = await ask("LOCAL_PUBLIC_KNOWLEDGE_EVIDENCE");
assert(result.mode === "extractive", `管理员明确提问应为 extractive，实际为 ${result.mode}`);
assert(result.citations.length > 0 && result.citations[0]?.location === "第1段" && result.citations[0]?.chunkIndex === 0, "公开资料引用缺少第 1 段定位");
console.log(`PASS 管理员公开资料：mode=${result.mode}，citations=${result.citations.length}，定位=${result.citations[0]?.location}`);

result = await ask("火星基地建设预算");
assert(result.mode === "no_basis" && result.citations.length === 0, "无关问题必须返回 no_basis 且不带引用");
console.log(`PASS 无关问题：mode=${result.mode}，citations=${result.citations.length}`);

let response = await localRequest("/api/local-test/accounts", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ action: "switch", account: "staff" }),
});
assert(response.status === 200, `切换普通员工失败：HTTP ${response.status}`);
result = await ask("ZXCVB9876");
assert(result.mode === "no_basis" && result.citations.length === 0, "普通员工询问机密资料必须返回 no_basis 且不泄露引用");
assert(!result.answer.includes("本机机密测试资料") && !result.answer.includes("ZXCVB9876"), "普通员工回答泄露了机密资料标题或摘录");
console.log(`PASS 普通员工机密资料：mode=${result.mode}，citations=${result.citations.length}，无泄露=true`);

response = await localRequest("/api/local-test/accounts", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ action: "clear" }),
});
assert(response.status === 200, `恢复管理员失败：HTTP ${response.status}`);
result = await ask("ZXCVB9876");
assert(result.mode === "extractive" && result.citations.some((citation) => citation.title.includes("本机机密测试资料") && citation.location === "第1段"), "管理员应获得机密虚构资料及分片定位");
console.log(`PASS 管理员机密资料：mode=${result.mode}，citations=${result.citations.length}，定位=${result.citations[0]?.location}`);
