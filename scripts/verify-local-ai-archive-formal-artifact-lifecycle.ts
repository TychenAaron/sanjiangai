// 本脚本通过已启动的 localhost 服务验证 AI 资料库正式化闭环；全部内容为虚构关键词，不访问 OA 或线上服务。
const baseUrl = process.env.LOCAL_TEST_BASE_URL || "http://localhost:5173";
let cookie = "";
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers); if (cookie) headers.set("cookie", cookie);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers }); const setCookie = response.headers.get("set-cookie"); if (setCookie) cookie = setCookie.split(";", 1)[0]; return response;
}
async function identity(account: "admin" | "staff") {
  const action = account === "admin" ? { action: "clear" } : { action: "switch", account };
  const response = await request("/api/local-test/accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(action) });
  assert(response.status === 200, "切换虚构测试身份失败");
}

await identity("staff");
const created = await request("/api/writing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create", documentType: "通知", title: "AIARCHIVE-虚构正式化验收", recipient: "虚构对象", facts: "AIARCHIVE-UNIQUE-TEST-KEYWORD，仅用于本机验收。", referenceQuery: "AIARCHIVE-UNIQUE-TEST-KEYWORD" }) });
assert(created.status === 201, `创建虚构写作成果失败 HTTP ${created.status}`);
const artifactsResponse = await request("/api/writing/artifacts"); const artifacts = await artifactsResponse.json() as { artifacts: Array<{ id: string; status: string }> };
const artifact = artifacts.artifacts[0]; assert(artifact?.status === "NON_FORMAL", "成功写作必须产生 NON_FORMAL artifact");
let search = await request("/api/knowledge/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "AIARCHIVE-UNIQUE-TEST-KEYWORD" }) });
assert((await search.json() as { results: unknown[] }).results.length === 0, "NON_FORMAL artifact 不得进入 RAG");
const forbidden = await request(`/api/writing/artifacts/${artifact.id}/formalize`, { method: "POST" }); assert(forbidden.status === 403, "非管理员不得正式化");
await identity("admin");
const crossUser = await request(`/api/writing/artifacts/${artifact.id}`); assert(crossUser.status === 200, "管理员应可读取最小管理成果");
const formalized = await request(`/api/writing/artifacts/${artifact.id}/formalize`, { method: "POST" }); assert(formalized.status === 201, `管理员正式化失败 HTTP ${formalized.status}`);
const formal = await formalized.json() as { formalArtifact: { id: string; knowledgeDocumentId: string; knowledgeVersionId: string } }; assert(formal.formalArtifact.knowledgeDocumentId && formal.formalArtifact.knowledgeVersionId, "正式成果必须关联 document/version");
const managedList = await request("/api/writing/artifacts?page=1&pageSize=1&status=FORMALIZED"); const managed = await managedList.json() as { page: number; artifacts: Array<{ content?: string; contentAvailable: boolean }> }; assert(managedList.status === 200 && managed.page === 1 && managed.artifacts.every((item) => item.content === undefined && item.contentAvailable === false), "管理员列表必须分页且不得泄露他人正文");
const managedDetail = await request(`/api/writing/artifacts/${artifact.id}`); const managedArtifact = await managedDetail.json() as { artifact: { content?: string; contentAvailable: boolean } }; assert(managedDetail.status === 200 && managedArtifact.artifact.content === undefined && managedArtifact.artifact.contentAvailable === false, "管理员详情默认不得泄露他人正文");
const formalDetail = await request(`/api/formal-artifacts/${formal.formalArtifact.id}`); const detail = await formalDetail.json() as { knowledge: { approvalStatus: string; resourceStatus?: string } | null }; assert(formalDetail.status === 200 && ["pending", "pending_review"].includes(detail.knowledge?.approvalStatus || detail.knowledge?.resourceStatus || ""), "正式成果详情必须实时显示待审核状态");
const repeated = await request(`/api/writing/artifacts/${artifact.id}/formalize`, { method: "POST" }); assert(repeated.status === 200, "重复正式化必须幂等");
search = await request("/api/knowledge/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "AIARCHIVE-UNIQUE-TEST-KEYWORD" }) }); assert((await search.json() as { results: unknown[] }).results.length === 0, "待审核正式成果不得进入 RAG");
const approved = await request(`/api/documents/${formal.formalArtifact.knowledgeDocumentId}/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: "approved", resourceCategory: "项目资料", sourceOrganization: "虚构单位", documentDate: "2026-08-28", applicableScope: "虚构范围", reliabilityScore: 80, comment: "虚构验收批准" }) }); assert(approved.status === 200, "虚构正式成果审核失败");
search = await request("/api/knowledge/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "AIARCHIVE-UNIQUE-TEST-KEYWORD" }) }); assert((await search.json() as { results: unknown[] }).results.length > 0, "审核通过后应进入 RAG");
const archived = await request(`/api/documents/${formal.formalArtifact.knowledgeDocumentId}/lifecycle`, { method: "POST" }); assert(archived.status === 200, "归档虚构正式成果失败");
search = await request("/api/knowledge/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "AIARCHIVE-UNIQUE-TEST-KEYWORD" }) }); assert((await search.json() as { results: unknown[] }).results.length === 0, "归档后必须退出 RAG");
console.log("PASS AI archive HTTP lifecycle: artifact isolation, authorization, formalization, approval, archive and idempotency.");
