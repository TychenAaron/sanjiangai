// 本文件使用注入的 mock fetch 验证模型网关，不启动服务、不读取数据库、不发起真实网络请求。
// 所有引用均为虚构文本，用于验证未配置、合格引用、越界引用、无引用、超时、网关错误和无权资料隔离。
import {
  readModelGatewayConfig,
  resolveGroundedAnswer,
  type GatewayFetch,
  type ModelGatewayCitation,
} from "../lib/model-gateway.ts";

const citations: ModelGatewayCitation[] = [
  { title: "本机虚构公开资料", version: 1, sourceType: "local_test", location: "第1段", excerpt: "LOCAL_PUBLIC_KNOWLEDGE_EVIDENCE：虚构公开依据。" },
  { title: "本机虚构内部资料", version: 1, sourceType: "local_test", location: "第2段", excerpt: "LOCAL_INTERNAL_KNOWLEDGE_EVIDENCE：虚构内部依据。" },
];

const configured = readModelGatewayConfig({ MODEL_GATEWAY_BASE_URL: "https://mock-model.invalid", MODEL_GATEWAY_MODEL: "local-mock-model" });
const unconfigured = readModelGatewayConfig({});

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function jsonMock(content: string): GatewayFetch {
  return async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { "content-type": "application/json" } });
}

let calls = 0;
const failIfCalled: GatewayFetch = async () => {
  calls += 1;
  throw new Error("不应调用模型网关");
};

let result = await resolveGroundedAnswer("虚构公开依据", citations, unconfigured, failIfCalled);
assert(result.mode === "extractive" && calls === 0, "未配置模型时必须原文摘录且不调用网关");
console.log(`PASS 未配置模型：mode=${result.mode}，mockCalls=${calls}`);

result = await resolveGroundedAnswer("虚构公开依据", citations, configured, jsonMock("依据公开资料可得出结论。[1]"));
assert(result.mode === "model", "合格模型引用应返回 model 模式");
console.log(`PASS 合格模型引用：mode=${result.mode}`);

result = await resolveGroundedAnswer("虚构公开依据", citations, configured, jsonMock("错误引用示例。[9]"));
assert(result.mode === "extractive", "越界引用必须降级 extractive");
console.log(`PASS 越界引用降级：mode=${result.mode}`);

result = await resolveGroundedAnswer("虚构公开依据", citations, configured, jsonMock("没有引用的结论。"));
assert(result.mode === "extractive", "无引用模型结论必须降级 extractive");
console.log(`PASS 无引用结论降级：mode=${result.mode}`);

const timeoutMock: GatewayFetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
  init?.signal?.addEventListener("abort", () => reject(new DOMException("mock timeout", "AbortError")), { once: true });
});
result = await resolveGroundedAnswer("虚构公开依据", citations, { ...configured, timeoutMs: 10 }, timeoutMock);
assert(result.mode === "extractive", "超时必须降级 extractive");
console.log(`PASS 模型超时降级：mode=${result.mode}`);

const serverErrorMock: GatewayFetch = async () => new Response("mock error", { status: 500 });
result = await resolveGroundedAnswer("虚构公开依据", citations, configured, serverErrorMock);
assert(result.mode === "extractive", "网关 500 必须降级 extractive");
console.log(`PASS 网关 500 降级：mode=${result.mode}`);

calls = 0;
result = await resolveGroundedAnswer("无可靠依据的问题", [], configured, failIfCalled);
assert(result.mode === "no_basis" && calls === 0, "无可靠依据必须 no_basis 且不调用网关");
console.log(`PASS 无可靠依据：mode=${result.mode}，mockCalls=${calls}`);

calls = 0;
const restrictedCitations: ModelGatewayCitation[] = [];
result = await resolveGroundedAnswer("机密测试资料", restrictedCitations, configured, failIfCalled);
assert(result.mode === "no_basis" && calls === 0, "普通员工无权机密资料必须 no_basis 且 mock 不得收到标题或正文");
console.log(`PASS 普通员工机密隔离：mode=${result.mode}，mockCalls=${calls}，泄露=false`);
