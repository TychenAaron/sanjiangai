// 本脚本离线核验 request_id、结构化日志、审计关联和健康检查边界；不访问模型、OA、真实资料或网络。
import { readFile } from "node:fs/promises";
import { getRequestId, observedError, observeResponse } from "../lib/runtime-observability.ts";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

const propagatedRequest = new Request("https://local.test/api/health", { headers: { "x-request-id": "verify-request-123" } });
const generatedRequest = new Request("https://local.test/api/health");
assert(getRequestId(propagatedRequest) === "verify-request-123", "有效 request_id 必须透传");
assert(/^[0-9a-f-]{36}$/i.test(getRequestId(generatedRequest)), "缺失 request_id 时必须生成 UUID");
const response = observeResponse(propagatedRequest, "verify.route", Date.now() - 2, Response.json({ ok: true }), { id: "virtual-user" });
const error = observedError(propagatedRequest, "verify.route", Date.now() - 2, 503, "虚构错误", "virtual_error", { id: "virtual-user" });
assert(response.headers.get("x-request-id") === "verify-request-123", "成功响应必须回传 request_id");
assert((await error.json() as { request_id?: string }).request_id === "verify-request-123", "错误响应必须返回 request_id");

const [schema, migration, proxy, health, observability, knowledgeAsk, writing, oaTest] = await Promise.all([
  readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  readFile(new URL("../drizzle/0014_runtime_observability.sql", import.meta.url), "utf8"),
  readFile(new URL("../proxy.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/runtime-observability.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/knowledge/ask/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/writing/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/oa-connectors/[id]/test/route.ts", import.meta.url), "utf8"),
]);
assert(schema.includes('requestId: text("request_id")') && migration.includes("audit_logs_request_id_idx"), "审计表必须保存并索引 request_id");
assert(proxy.includes('matcher: ["/api/:path*"]') && proxy.includes('x-request-id'), "所有 API 请求必须经过 request_id 代理入口");
assert(health.includes("alive") && health.includes("d1Available") && health.includes("modelGateway") && health.includes('"unconfigured"'), "健康检查必须区分服务、D1、绑定和模型未配置状态");
assert(observability.includes("request_id") && observability.includes("user_id") && observability.includes("latency_ms") && observability.includes("error_code"), "结构化日志必须包含最小关联字段");
assert(!observability.includes("password") && !observability.includes("token") && !observability.includes("secret"), "结构化日志实现不得定义或记录敏感凭证内容");
assert(knowledgeAsk.includes("requestId") && knowledgeAsk.includes("withAuditRequestId") && writing.includes("requestId: getRequestId(request)") && oaTest.includes("requestId"), "知识问答、写作和 OA 检测审计必须关联 request_id");
console.log("Runtime observability verification passed.");
