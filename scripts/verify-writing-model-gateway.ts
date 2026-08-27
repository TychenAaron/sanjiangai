// 本脚本使用 mock fetch 验证智能写作模型网关；不启动服务、不读取 D1/R2、不访问网络，也不使用真实资料或密钥。
import { generateWritingWithGateway, readWritingModelConfig, type WritingGatewayFetch, type WritingGenerationInput } from "../lib/writing-model-gateway.ts";

const input: WritingGenerationInput = {
  documentType: "通知", title: "本机虚构模型网关验收", recipient: "本机虚构对象", submittingDepartment: "本机虚构部门",
  facts: "本机虚构事实，仅用于模型网关 mock 验证。", referenceQuery: "LOCAL_WRITING_GATEWAY_REFERENCE",
  references: [{ documentId: "local-reference", title: "本机虚构正式依据", version: 1, excerpt: "LOCAL_AUTHORIZED_REFERENCE：虚构且已授权的正式依据片段。", sourceType: "local_test", chunkIndex: 0, location: "第1段", score: 99 }],
  privateReferenceCount: 1,
};

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const noCall: WritingGatewayFetch = async () => { throw new Error("本路径不得调用模型"); };
const runtime = { AI_MODEL_ENABLED: "true", AI_GATEWAY_BASE_URL: "https://mock-writing-gateway.invalid/v1", AI_GATEWAY_API_KEY: "mock-secret-not-real", AI_WRITING_MODEL: "mock-writing-model", AI_MODEL_TIMEOUT_MS: "100" };
const validStructured = JSON.stringify({ title: "模型不应覆盖的标题", documentType: "通知", recipient: "模型不应覆盖的对象", submittingDepartment: "模型不应覆盖的部门", dateLabel: "【待人工核验】", blocks: [{ id: "heading-1", type: "heading", level: 1, text: "一、虚构背景" }, { id: "paragraph-1", type: "paragraph", text: "本机虚构模型正文。" }, { id: "list-1", type: "numbered_list", items: ["本机虚构事项。"] }, { id: "table-1", type: "table", columns: ["阶段", "成果"], rows: [["本机", "虚构"]] }] });

// 验证禁用模型时不触发 fetch，仍得到可导出的模拟结构化正文。
let result = await generateWritingWithGateway(input, {}, noCall);
assert(result.mode === "simulation" && result.category === "disabled" && result.structured.blocks.length > 0, "未启用模型必须走模拟生成");
console.log("PASS 未启用模型使用模拟生成");
result = await generateWritingWithGateway(input, { AI_MODEL_ENABLED: "true", AI_GATEWAY_BASE_URL: "https://mock-writing-gateway.invalid/v1" }, noCall);
assert(result.mode === "fallback" && result.category === "not_configured", "启用但缺少 API Key 必须回退模拟生成");
console.log("PASS 配置不完整安全回退");

// 验证配置、模型覆盖名、授权输入边界和私有材料原文隔离。
let captured = "";
const successMock: WritingGatewayFetch = async (_url, init) => {
  captured = String(init?.body || "");
  assert(JSON.parse(captured).model === "mock-writing-model", "AI_WRITING_MODEL 未覆盖请求模型名");
  assert(!captured.includes("mock-secret-not-real") && !captured.includes("private-file-name") && !captured.includes("PRIVATE_RAW_CONTENT"), "模型请求泄露密钥或私有材料原文");
  return new Response(JSON.stringify({ choices: [{ message: { content: validStructured } }] }), { status: 200 });
};
assert(readWritingModelConfig(runtime).model === "mock-writing-model", "环境变量模型覆盖未生效");
result = await generateWritingWithGateway(input, runtime, successMock);
assert(result.mode === "model" && result.category === "success" && result.structured.title === input.title && result.structured.recipient === input.recipient, "合法结构化响应未被安全采用");
assert(captured.includes("LOCAL_AUTHORIZED_REFERENCE") && captured.includes("仅可借鉴结构"), "授权依据或私有材料结构限制未进入模型提示");
console.log("PASS OpenAI-compatible 请求、模型覆盖和输入边界正确");

// 验证超时、401/429/500、空响应、非法 JSON、非法结构和拒答均不使用模型文本，而是回退模拟生成。
const cases: Array<[string, WritingGatewayFetch, string]> = [
  ["401", async () => new Response("unauthorized", { status: 401 }), "http_401"],
  ["429", async () => new Response("limited", { status: 429 }), "http_429"],
  ["500", async () => new Response("failed", { status: 500 }), "http_error"],
  ["响应不是 JSON", async () => new Response("not json", { status: 200 }), "invalid_json"],
  ["空响应", async () => new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), { status: 200 }), "empty_response"],
  ["非法 JSON", async () => new Response(JSON.stringify({ choices: [{ message: { content: "不是 JSON" } }] }), { status: 200 }), "invalid_json"],
  ["非法结构", async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ blocks: [] }) } }] }), { status: 200 }), "invalid_structure"],
  ["模型拒答", async () => new Response(JSON.stringify({ choices: [{ message: { content: "抱歉，我无法完成。" } }] }), { status: 200 }), "rejected"],
];
for (const [name, mock, category] of cases) {
  result = await generateWritingWithGateway(input, runtime, mock);
  assert(result.mode === "fallback" && result.category === category, `${name} 必须安全回退`);
}
const timeoutMock: WritingGatewayFetch = async (_url, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("mock timeout", "AbortError")), { once: true }));
result = await generateWritingWithGateway(input, { ...runtime, AI_MODEL_TIMEOUT_MS: "500" }, timeoutMock);
assert(result.mode === "fallback" && result.category === "timeout", "超时必须安全回退");
result = await generateWritingWithGateway({ ...input, facts: "D4 机密本机虚构内容" }, runtime, noCall);
assert(result.mode === "fallback" && result.category === "restricted_input", "敏感标识不得发送模型");
console.log("PASS 失败、拒答、敏感输入均安全回退模拟生成");
