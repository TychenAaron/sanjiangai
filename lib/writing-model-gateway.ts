// 本文件提供智能写作专用的可替换 OpenAI-compatible 网关；只接收已完成权限过滤的有限输入，不读取数据库或私有 R2。
import type { KnowledgeCitation } from "./rag.ts";
import { generateStructuredWriting, normalizeStructuredWriting, type StructuredWriting } from "./writing-structured.ts";
import type { WritingType } from "./writing.ts";

export type WritingModelRuntime = Record<string, string | undefined>;
export type WritingGatewayFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type WritingModelConfig = {
  enabled: boolean;
  configured: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
};

export type WritingGenerationInput = {
  documentType: WritingType;
  title: string;
  recipient: string;
  submittingDepartment: string;
  facts: string;
  referenceQuery: string;
  references: KnowledgeCitation[];
  privateReferenceCount: number;
};

export type WritingGenerationResult = {
  structured: StructuredWriting;
  mode: "simulation" | "model" | "fallback";
  category: "disabled" | "not_configured" | "restricted_input" | "success" | "timeout" | "http_401" | "http_429" | "http_error" | "empty_response" | "invalid_json" | "invalid_structure" | "rejected" | "network_error";
  model: string;
  inputChars: number;
  outputChars: number;
};

const DEFAULT_MODEL = "Qwen3.8-27B";
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 60_000;
const MAX_REFERENCE_CHARS = 1_200;

// 读取仅供服务端使用的写作网关配置；输入为运行环境变量，输出不应直接返回浏览器或写入普通日志。
export function readWritingModelConfig(runtime: WritingModelRuntime): WritingModelConfig {
  const enabled = runtime.AI_MODEL_ENABLED?.trim().toLowerCase() === "true";
  const baseUrl = runtime.AI_GATEWAY_BASE_URL?.trim().replace(/\/$/, "") || "";
  const configuredTimeout = Number(runtime.AI_MODEL_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout >= 500 && configuredTimeout <= MAX_TIMEOUT_MS
    ? configuredTimeout : DEFAULT_TIMEOUT_MS;
  return {
    enabled,
    configured: Boolean(baseUrl && runtime.AI_GATEWAY_API_KEY?.trim()),
    baseUrl,
    apiKey: runtime.AI_GATEWAY_API_KEY?.trim() || "",
    model: runtime.AI_WRITING_MODEL?.trim() || DEFAULT_MODEL,
    timeoutMs,
  };
}

// 对高敏标签作保守阻断。输入为拟发送模型的有限材料，输出表示是否只能使用本地模拟生成，绝不把命中内容记录到日志。
function containsRestrictedWritingContent(value: string) {
  return /(?:\bD4\b|绝密|机密|秘密|身份证(?:号)?|银行账号|个人隐私|核心敏感)/i.test(value);
}

// 构建模型请求消息。输入仅包含表单事实、已授权可靠引用和不含文件名/原文的私有材料结构提示，输出为 OpenAI-compatible messages。
export function buildWritingMessages(input: WritingGenerationInput) {
  const references = input.references.map((reference, index) => ({
    index: index + 1,
    title: reference.title,
    version: reference.version,
    location: reference.location,
    excerpt: reference.excerpt.slice(0, MAX_REFERENCE_CHARS),
  }));
  return [
    {
      role: "system",
      content: "你是正式中文公文写作助手。只能使用本次提供的已确认事实和正式依据；不得补充外部常识、虚构金额、日期、政策条款、文号、人员或单位名称。缺少正式依据时必须写【待人工核验】。私有参考材料只可影响篇章、措辞和表格组织，绝不能成为事实或正式引用。只返回一个 JSON 对象，禁止 Markdown、代码块和额外说明。JSON 必须包含 title、documentType、recipient、submittingDepartment、dateLabel、blocks；blocks 仅可为 heading(level 1/2/3,text)、paragraph(text)、notice(text)、numbered_list(items) 或 table(columns,rows)。表格必须使用 columns 与 rows 的真实数组。",
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "生成完整、连贯、可直接编辑的正式公文初稿。",
        documentType: input.documentType,
        title: input.title,
        recipient: input.recipient,
        submittingDepartment: input.submittingDepartment,
        confirmedFacts: input.facts,
        referenceQuery: input.referenceQuery,
        authorizedReferences: references,
        privateReferenceGuidance: input.privateReferenceCount > 0 ? "当前工作区有私有参考材料：仅可借鉴结构、表达和表格组织；不得输出其文件名、原文、摘要或作为引用。" : "无私有参考材料。",
      }),
    },
  ];
}

function simulated(input: WritingGenerationInput, category: WritingGenerationResult["category"], mode: "simulation" | "fallback", inputChars = 0): WritingGenerationResult {
  const structured = generateStructuredWriting({ type: input.documentType, title: input.title, recipient: input.recipient, submittingDepartment: input.submittingDepartment, facts: input.facts, references: input.references, privateReferenceCount: input.privateReferenceCount });
  return { structured, mode, category, model: DEFAULT_MODEL, inputChars, outputChars: 0 };
}

// 调用外部模型并验证结果。输入必须已完成权限过滤；输出永远是经校验的结构化正文或本地模拟回退，不记录正文、密钥或提示词。
export async function generateWritingWithGateway(input: WritingGenerationInput, runtime: WritingModelRuntime, gatewayFetch: WritingGatewayFetch = fetch): Promise<WritingGenerationResult> {
  const config = readWritingModelConfig(runtime);
  if (!config.enabled) return simulated(input, "disabled", "simulation");
  if (!config.configured) return simulated(input, "not_configured", "fallback");
  const messages = buildWritingMessages(input);
  const inputText = JSON.stringify(messages);
  if (containsRestrictedWritingContent(inputText)) return simulated(input, "restricted_input", "fallback", inputText.length);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await gatewayFetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, temperature: 0.2, max_tokens: 3_500, response_format: { type: "json_object" }, messages }),
    });
    if (!response.ok) return simulated(input, response.status === 401 ? "http_401" : response.status === 429 ? "http_429" : "http_error", "fallback", inputText.length);
    let data: { choices?: Array<{ message?: { content?: unknown } }> };
    try { data = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> }; }
    catch { return simulated(input, "invalid_json", "fallback", inputText.length); }
    const content = typeof data.choices?.[0]?.message?.content === "string" ? data.choices[0].message.content.trim() : "";
    if (!content) return simulated(input, "empty_response", "fallback", inputText.length);
    if (/(?:无法|不能|拒绝|sorry|cannot)/i.test(content) && !content.startsWith("{")) return simulated(input, "rejected", "fallback", inputText.length);
    let structured: StructuredWriting | null;
    try { structured = normalizeStructuredWriting(JSON.parse(content)); }
    catch { return simulated(input, "invalid_json", "fallback", inputText.length); }
    if (!structured || structured.documentType !== input.documentType) return simulated(input, "invalid_structure", "fallback", inputText.length);
    // 标题和基础信息以用户已确认输入为准，避免模型擅自改写单位、对象等元数据。
    return { structured: { ...structured, title: input.title, documentType: input.documentType, recipient: input.recipient || "【待人工核验】", submittingDepartment: input.submittingDepartment || "【待人工核验】" }, mode: "model", category: "success", model: config.model, inputChars: inputText.length, outputChars: content.length };
  } catch (error) {
    return simulated(input, error instanceof DOMException && error.name === "AbortError" ? "timeout" : "network_error", "fallback", inputText.length);
  } finally { clearTimeout(timer); }
}
