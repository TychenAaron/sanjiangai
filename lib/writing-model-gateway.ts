// 本文件提供智能写作专用的可替换 OpenAI-compatible 网关；只接收已完成权限过滤的有限输入，不读取数据库或私有 R2。
import type { KnowledgeCitation } from "./rag.ts";
import { normalizeStructuredWriting, structuredWritingToText, type StructuredWriting } from "./writing-structured.ts";
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
  privateReferenceGuidance: Array<{ format: string; excerpt: string; locations: string[] }>;
};

export type WritingGenerationResult = {
  structured?: StructuredWriting;
  content?: string;
  mode: "model" | "failed";
  category: "model_disabled" | "model_not_configured" | "model_restricted_input" | "success" | "model_timeout" | "model_http_error" | "model_empty_response" | "model_invalid_json" | "model_invalid_structure" | "model_rejected" | "model_network_error";
  model: string;
  inputChars: number;
  outputChars: number;
};

const DEFAULT_MODEL = "Qwen3.8-27B";
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 120_000;
const WRITING_MODEL_ENV_KEYS = ["AI_MODEL_ENABLED", "AI_GATEWAY_BASE_URL", "AI_GATEWAY_API_KEY", "AI_WRITING_MODEL", "AI_MODEL_TIMEOUT_MS"] as const;

type WritingFormatSkeleton = {
  titleHierarchy: string[];
  sectionOrder: string[];
  numberingStyle: string[];
  tableGuidance: string;
  paragraphGuidance: string;
  toneAndClosing: string;
};

// 合并 Worker bindings 与本机 Node 运行时变量。输入为两个服务端来源，输出只包含写作网关所需键；Worker 值优先，本机 .env 仅在 bindings 缺失时补充。
// 本函数不会读取、打印或返回给浏览器，调用方不得记录返回值，避免密钥泄露。
export function resolveWritingModelRuntime(workerRuntime: WritingModelRuntime, nodeRuntime: WritingModelRuntime): WritingModelRuntime {
  return Object.fromEntries(WRITING_MODEL_ENV_KEYS.map((key) => [key, workerRuntime[key]?.trim() || nodeRuntime[key]?.trim() || undefined]));
}

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

// 从参考原文提取匿名格式骨架。输入仅在服务端内存中短暂读取，输出绝不包含标题、段落、数字、单位、事实或结论原文。
function createFormatSkeleton(source: string, documentType: WritingType): WritingFormatSkeleton {
  const headingCount = source.split(/\r?\n/).filter((line) => /^(?:[一二三四五六七八九十]+、|[（(][一二三四五六七八九十]+[）)]|\d+[.、])/u.test(line.trim())).length;
  const numberingStyle = [/[一二三四五六七八九十]+、/u.test(source) ? "中文序号：一、二、三、" : "一级编号", /[（(][一二三四五六七八九十]+[）)]/u.test(source) ? "括号二级编号：（一）（二）" : "二级编号", /\d+[.、]/.test(source) ? "阿拉伯编号：1. 2. 3." : "必要时使用阿拉伯编号"].filter(Boolean);
  const detectedColumns = source.split(/\r?\n/).reduce((maximum, line) => Math.max(maximum, line.split(/[\t|｜]/).filter(Boolean).length), 0);
  const paragraphCount = Math.max(2, Math.min(4, Math.ceil(source.split(/\n\s*\n/).filter(Boolean).length / Math.max(1, headingCount))));
  const sections = documentType === "请示" ? ["背景与必要性", "请示事项", "拟办建议"] : documentType === "通知" ? ["事项说明", "工作要求", "安排与结语"] : ["工作概述", "进展与问题", "下一步安排"];
  return {
    titleHierarchy: headingCount >= 3 ? ["一级标题", "二级标题", "三级标题"] : headingCount >= 2 ? ["一级标题", "二级标题"] : ["一级标题"],
    sectionOrder: sections,
    numberingStyle,
    tableGuidance: detectedColumns >= 2 ? `适用位置插入 ${Math.min(detectedColumns, 4)} 列职责、安排或阶段类表格；列标题使用通用类别，不填未确认事实。` : "仅在比较职责、阶段或事项时插入 2 至 4 列通用表格。",
    paragraphGuidance: "每节采用" + paragraphCount + "段中性论述，不使用未确认量化成果。",
    toneAndClosing: "使用正式呈报或通知语气，结语采用请示、通知或后续安排式收束。",
  };
}

// 构建模型请求消息。私有材料优先作为格式骨架，其次才使用已授权资料的格式骨架；两者均不作为正式事实或 citations。
export function buildWritingMessages(input: WritingGenerationInput) {
  const privateFormatSkeletons = input.privateReferenceGuidance.map((reference) => createFormatSkeleton(reference.excerpt, input.documentType));
  const referenceFormats = input.references.map((reference) => createFormatSkeleton(reference.excerpt, input.documentType));
  return [
    {
      role: "system",
      content: "你是正式中文公文写作助手。一次性起草完整、连贯、可编辑的正文，不解释过程，不要输出“我无法”“以下是草稿”等前言。格式优先级：先遵循本次私有参考材料的匿名格式骨架；若无私有材料，再遵循已授权相似资料的匿名格式骨架；两者都无时按正式结构化公文模板组织完整层级、论述、编号、适用表格和结语。格式骨架只表示怎么写，绝不表示应写什么事实。confirmedFacts 和明确正式引用是正文事实的唯一来源；未在其中出现的数字、金额、比例、日期、次数、项目数量、覆盖范围、完成率、通过率、测评结果、政策条款、文号、人员、单位、成果、结论和部署事实一律不得出现，更不得补充看似合理的测试数据。未提供成果、统计数据、测试结果或部署事实时，只写拟开展工作、计划安排、待核验事项等中性非量化表述，或标记【待人工核验】。优先输出 JSON 结构化公文；若无法做到，可直接输出可阅读的连续正式正文。禁止 Markdown 代码围栏和 <think> 内容。",
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
        privateFormatSkeletons,
        authorizedSimilarDocumentFormatSkeletons: privateFormatSkeletons.length ? [] : referenceFormats,
        fallbackFormat: privateFormatSkeletons.length || referenceFormats.length ? undefined : "使用系统合格结构化公文模板。",
      }),
    },
  ];
}

// 提取模型返回中的唯一完整 JSON 对象。输入仅为模型 content，输出为待严格解析的 JSON 字符串；不猜测、补造或修复公文内容。
export function extractSingleJsonObject(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const source = (fenced?.[1] || trimmed).trim();
  const candidates: string[] = [];
  let start = -1; let depth = 0; let inString = false; let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') { inString = true; continue; }
    if (character === "{") { if (depth === 0) start = index; depth += 1; continue; }
    if (character === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) { candidates.push(source.slice(start, index + 1)); start = -1; }
    }
  }
  return candidates.length === 1 && depth === 0 ? candidates[0] : null;
}

// 创建不含正文的模型失败结果。输入仅为安全错误类别、模型名和长度统计；输出用于审计与页面提示，绝不生成或保存模拟公文。
function failed(category: Exclude<WritingGenerationResult["category"], "success">, model: string, inputChars = 0): WritingGenerationResult {
  return { mode: "failed", category, model, inputChars, outputChars: 0 };
}

// 调用外部模型并保留正文。输入必须已完成权限过滤；仅 HTTP/网络/超时/空响应等传输失败会失败，格式解析只决定渲染方式。
export async function generateWritingWithGateway(input: WritingGenerationInput, runtime: WritingModelRuntime, gatewayFetch: WritingGatewayFetch = fetch): Promise<WritingGenerationResult> {
  const config = readWritingModelConfig(runtime);
  if (!config.enabled) return failed("model_disabled", config.model);
  if (!config.configured) return failed("model_not_configured", config.model);
  const messages = buildWritingMessages(input);
  const inputText = JSON.stringify(messages);
  if (containsRestrictedWritingContent(inputText)) return failed("model_restricted_input", config.model, inputText.length);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await gatewayFetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      // 不发送 response_format 扩展：LM Studio 等本机兼容网关可能拒绝该可选字段。
      // 结构化约束由提示词与下方 normalizeStructuredWriting 双重校验保证。
      body: JSON.stringify({ model: config.model, temperature: 0.2, max_tokens: 3_500, messages }),
    });
    if (!response.ok) return failed("model_http_error", config.model, inputText.length);
    let data: { choices?: Array<{ message?: { content?: unknown; reasoning_content?: unknown } }> };
    try { data = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> }; }
    catch { return failed("model_invalid_json", config.model, inputText.length); }
    const content = typeof data.choices?.[0]?.message?.content === "string" ? data.choices[0].message.content.trim() : "";
    // Qwen 的 reasoning_content 不参与正文读取，避免把推理内容误当成结构化公文。
    if (!content) return failed("model_empty_response", config.model, inputText.length);
    const visibleContent = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    if (!visibleContent) return failed("model_empty_response", config.model, inputText.length);
    const displayContent = visibleContent.replace(/^```(?:json|markdown|text)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const jsonObject = extractSingleJsonObject(visibleContent);
    if (!jsonObject) return { content: displayContent, mode: "model", category: "success", model: config.model, inputChars: inputText.length, outputChars: content.length };
    let structured: StructuredWriting | null;
    try { structured = normalizeStructuredWriting(JSON.parse(jsonObject)); }
    catch { structured = null; }
    // 模型格式不合格时保留连续正文；结构化解析只影响页面与 Word 是否使用表格，不作为生成准入条件。
    if (!structured || structured.documentType !== input.documentType) return { content: displayContent, mode: "model", category: "success", model: config.model, inputChars: inputText.length, outputChars: content.length };
    // 标题和基础信息以用户已确认输入为准，避免模型擅自改写单位、对象等元数据。
    const normalized = { ...structured, title: input.title, documentType: input.documentType, recipient: input.recipient || "【待人工核验】", submittingDepartment: input.submittingDepartment || "【待人工核验】" };
    return { structured: normalized, content: structuredWritingToText(normalized), mode: "model", category: "success", model: config.model, inputChars: inputText.length, outputChars: content.length };
  } catch (error) {
    return failed(error instanceof DOMException && error.name === "AbortError" ? "model_timeout" : "model_network_error", config.model, inputText.length);
  } finally { clearTimeout(timer); }
}
