// 本脚本使用 mock fetch 验证智能写作模型网关；不启动服务、不读取 D1/R2、不访问网络，也不使用真实资料或密钥。
import { buildWritingMessages, extractSingleJsonObject, generateWritingWithGateway, readWritingModelConfig, resolveWritingModelRuntime, type WritingGatewayFetch, type WritingGenerationInput } from "../lib/writing-model-gateway.ts";

const input: WritingGenerationInput = {
  documentType: "通知", title: "本机虚构模型网关验收", recipient: "本机虚构对象", submittingDepartment: "本机虚构部门",
  facts: "本机虚构事实，仅用于模型网关 mock 验证。", referenceQuery: "LOCAL_WRITING_GATEWAY_REFERENCE",
  references: [{ documentId: "local-reference", title: "本机虚构正式依据", version: 1, excerpt: "LOCAL_AUTHORIZED_REFERENCE：虚构单位在2026年完成92%事项。\n一、虚构格式\n（二）虚构层级", sourceType: "local_test", chunkIndex: 0, location: "第1段", score: 99 }],
  privateReferenceGuidance: [{ format: "docx", excerpt: "某虚构集团完成100%部署成果。\n一、虚构格式\n（一）虚构层级", locations: ["第1段"] }],
};

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const noCall: WritingGatewayFetch = async () => { throw new Error("本路径不得调用模型"); };
const runtime = { AI_MODEL_ENABLED: "true", AI_GATEWAY_BASE_URL: "https://mock-writing-gateway.invalid/v1", AI_GATEWAY_API_KEY: "mock-secret-not-real", AI_WRITING_MODEL: "mock-writing-model", AI_MODEL_TIMEOUT_MS: "120000" };
const validStructured = JSON.stringify({ title: "模型不应覆盖的标题", documentType: "通知", recipient: "模型不应覆盖的对象", submittingDepartment: "模型不应覆盖的部门", dateLabel: "【待人工核验】", blocks: [{ id: "heading-1", type: "heading", level: 1, text: "一、虚构背景" }, { id: "paragraph-1", type: "paragraph", text: "本机虚构模型正文。" }, { id: "list-1", type: "numbered_list", items: ["本机虚构事项。"] }, { id: "table-1", type: "table", columns: ["阶段", "成果"], rows: [["本机", "虚构"]] }] });

// 验证禁用或配置不完整时不触发 fetch，且绝不生成可保存或导出的替代正文。
let result = await generateWritingWithGateway(input, {}, noCall);
assert(result.mode === "failed" && result.category === "model_disabled" && !result.structured, "未启用模型不得生成模拟正文");
console.log("PASS 未启用模型不生成正文");
result = await generateWritingWithGateway(input, { AI_MODEL_ENABLED: "true", AI_GATEWAY_BASE_URL: "https://mock-writing-gateway.invalid/v1" }, noCall);
assert(result.mode === "failed" && result.category === "model_not_configured" && !result.structured, "配置不完整不得生成模拟正文");
console.log("PASS 配置不完整不生成正文");

// 验证配置、模型覆盖名、授权输入边界和私有材料原文隔离。
let captured = "";
const successMock: WritingGatewayFetch = async (_url, init) => {
  captured = String(init?.body || "");
  assert(JSON.parse(captured).model === "mock-writing-model", "AI_WRITING_MODEL 未覆盖请求模型名");
  assert(!captured.includes("mock-secret-not-real"), "模型请求不得泄露密钥");
  assert(captured.includes("[PRIVATE_REFERENCES]") && captured.includes("某虚构集团") && captured.includes("[FORMAL_KNOWLEDGE_EVIDENCE]") && captured.includes("LOCAL_AUTHORIZED_REFERENCE"), "私有材料与正式证据未按分层进入模型 context");
  assert(!captured.includes("response_format"), "本机兼容网关请求不得携带可能被拒绝的 response_format 扩展");
  return new Response(JSON.stringify({ choices: [{ message: { content: validStructured } }] }), { status: 200 });
};
assert(readWritingModelConfig(runtime).model === "mock-writing-model" && readWritingModelConfig(runtime).timeoutMs === 120000, "模型名或 120 秒超时配置未生效");
const resolvedRuntime = resolveWritingModelRuntime({}, runtime);
assert(readWritingModelConfig(resolvedRuntime).enabled && readWritingModelConfig(resolvedRuntime).configured, "本机 process.env 回退未提供完整启用配置");
const bindingRuntime = resolveWritingModelRuntime({ AI_WRITING_MODEL: "worker-priority-model" }, runtime);
assert(readWritingModelConfig(bindingRuntime).model === "worker-priority-model", "Worker binding 必须优先于本机 process.env");
result = await generateWritingWithGateway(input, runtime, successMock);
assert(result.mode === "model" && result.category === "success" && result.structured.title === input.title && result.structured.recipient === input.recipient, "合法结构化响应未被安全采用");
assert(captured.includes("privateFormatSkeletons") && captured.includes("titleHierarchy") && captured.includes("paragraphGuidance") && captured.includes("authorizedSimilarDocumentFormatSkeletons"), "私有格式骨架未按最高优先级进入模型提示");
console.log("PASS OpenAI-compatible 请求、模型覆盖和输入边界正确");

const similarFormatMessage = JSON.stringify(buildWritingMessages({ ...input, privateReferenceGuidance: [] }));
assert(similarFormatMessage.includes("authorizedSimilarDocumentFormatSkeletons") && similarFormatMessage.includes("titleHierarchy") && similarFormatMessage.includes("[FORMAL_KNOWLEDGE_EVIDENCE]") && similarFormatMessage.includes("LOCAL_AUTHORIZED_REFERENCE"), "无私有材料时正式证据必须进入模型 context，同时保留格式骨架");
const templateMessage = JSON.stringify(buildWritingMessages({ ...input, references: [], privateReferenceGuidance: [] }));
assert(templateMessage.includes("使用系统合格结构化公文模板"), "无任何参考时必须使用系统模板");
assert(templateMessage.includes("confirmedFacts 和明确正式引用是正文事实的唯一来源") && templateMessage.includes("完成率、通过率、测评结果") && templateMessage.includes("部署事实一律不得出现"), "测试事实未提供数字时，提示词必须禁止补造数量、金额、比例和成果");
console.log("PASS 私有参考、授权相似资料、系统模板三层格式优先级正确");

// Qwen 可把推理放 reasoning_content，正文 content 只要存在唯一完整 JSON（含 JSON 围栏）仍可严格校验。
result = await generateWritingWithGateway(input, runtime, async () => new Response(JSON.stringify({ choices: [{ message: { reasoning_content: "不得读取或保存", content: `\`\`\`json\n${validStructured}\n\`\`\`` } }] }), { status: 200 }));
assert(result.mode === "model" && result.category === "success", "唯一 JSON 围栏内容应可被严格提取");
assert(extractSingleJsonObject(`说明文字\n${validStructured}\n结束说明`) === validStructured, "唯一完整顶层 JSON 应可提取");
assert(extractSingleJsonObject(`${validStructured}\n${validStructured}`) === null, "多个顶层 JSON 不得猜测采用");
console.log("PASS Qwen JSON 围栏与 reasoning_content 兼容正确");

// 验证传输失败不产生正文；模型 content 的格式差异则必须保留为连续正文。
const cases: Array<[string, WritingGatewayFetch, string]> = [
  ["401", async () => new Response("unauthorized", { status: 401 }), "model_http_error"],
  ["429", async () => new Response("limited", { status: 429 }), "model_http_error"],
  ["500", async () => new Response("failed", { status: 500 }), "model_http_error"],
  ["响应不是 JSON", async () => new Response("not json", { status: 200 }), "model_invalid_json"],
  ["空响应", async () => new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), { status: 200 }), "model_empty_response"],
];
for (const [name, mock, category] of cases) {
  result = await generateWritingWithGateway(input, runtime, mock);
  assert(result.mode === "failed" && result.category === category && result.model === "mock-writing-model" && !result.structured, `${name} 不得生成正文并应保留实际请求模型名`);
}
for (const content of ["不是 JSON 的虚构连续正文", JSON.stringify({ blocks: [] }), "以下是虚构正文"]) {
  result = await generateWritingWithGateway(input, runtime, async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }));
  assert(result.mode === "model" && result.category === "success" && result.content === content && !result.structured, "非结构化模型正文必须保留为连续正文");
}
const timeoutMock: WritingGatewayFetch = async (_url, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("mock timeout", "AbortError")), { once: true }));
result = await generateWritingWithGateway(input, { ...runtime, AI_MODEL_TIMEOUT_MS: "500" }, timeoutMock);
assert(result.mode === "failed" && result.category === "model_timeout" && !result.structured, "超时不得生成正文");
result = await generateWritingWithGateway({ ...input, facts: "D4 机密本机虚构内容" }, runtime, noCall);
assert(result.mode === "failed" && result.category === "model_restricted_input" && !result.structured, "敏感标识不得发送模型或生成正文");
for (const facts of ["员工请假申请按制度办理。", "因工作需要安排出差并报销差旅费用。", "请落实考勤、调休、加班和培训通知。", "行政办公会议工作安排。"] ) {
  result = await generateWritingWithGateway({ ...input, facts }, runtime, async () => new Response(JSON.stringify({ choices: [{ message: { content: "常规办公连续正文。" } }] }), { status: 200 }));
  assert(result.mode === "model" && result.content === "常规办公连续正文。", `常规办公内容不应被受限规则拦截：${facts}`);
}
console.log("PASS 传输失败与敏感输入均不生成正文；非结构化模型 content 保留展示");
