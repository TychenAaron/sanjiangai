// 本文件提供服务端可替换 Reranker Gateway：只重排已授权候选，不读取数据库、不向浏览器暴露地址或密钥。

export type RerankerRuntime = Record<string, string | undefined>;

export type RerankerGatewayConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  path: string;
  timeoutMs: number;
  configured: boolean;
};

export type RerankerCandidateInput = { text: string };
export type RerankerFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type RerankerResult =
  | { status: "success"; scores: Array<{ index: number; score: number }> }
  | { status: "not_configured" | "timeout" | "gateway_error" | "invalid_response" };

const DEFAULT_MODEL = "Qwen3-Reranker-4B";
const DEFAULT_PATH = "/rerank";
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_CANDIDATES = 50;

function normalizePath(value: string | undefined) {
  const path = value?.trim() || DEFAULT_PATH;
  return path.startsWith("/") && !path.includes("://") ? path : DEFAULT_PATH;
}

// 读取仅服务端可见的 Reranker 配置。输入来自 Worker binding 或安全运行时变量，输出不包含任何敏感值。
export function readRerankerGatewayConfig(runtime: RerankerRuntime): RerankerGatewayConfig {
  const baseUrl = runtime.RERANKER_BASE_URL?.trim().replace(/\/$/, "") || "";
  const configuredTimeout = Number(runtime.RERANKER_TIMEOUT_MS);
  return {
    baseUrl,
    apiKey: runtime.RERANKER_API_KEY?.trim() || "",
    model: runtime.RERANKER_MODEL?.trim() || DEFAULT_MODEL,
    path: normalizePath(runtime.RERANKER_PATH),
    timeoutMs: Number.isFinite(configuredTimeout) && configuredTimeout >= 500 && configuredTimeout <= MAX_TIMEOUT_MS
      ? configuredTimeout
      : DEFAULT_TIMEOUT_MS,
    configured: Boolean(baseUrl),
  };
}

function isRerankResult(value: unknown, candidateCount: number): value is { index: number; relevance_score: number } {
  return typeof value === "object" && value !== null &&
    typeof (value as { index?: unknown }).index === "number" &&
    Number.isInteger((value as { index: number }).index) &&
    (value as { index: number }).index >= 0 && (value as { index: number }).index < candidateCount &&
    typeof (value as { relevance_score?: unknown }).relevance_score === "number" &&
    Number.isFinite((value as { relevance_score: number }).relevance_score);
}

// 调用标准 /rerank 或 /v1/rerank 协议。输入必须来自已完成权限过滤的候选，输出只重排原有序号，绝不创建新候选。
export async function rerankCandidates(
  config: RerankerGatewayConfig,
  query: string,
  candidates: RerankerCandidateInput[],
  gatewayFetch: RerankerFetch = fetch,
): Promise<RerankerResult> {
  if (!config.configured) return { status: "not_configured" };
  if (!query.trim() || !candidates.length || candidates.length > MAX_CANDIDATES || candidates.some((candidate) => !candidate.text.trim())) {
    return { status: "invalid_response" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await gatewayFetch(`${config.baseUrl}${config.path}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: config.model, query, documents: candidates.map((candidate) => candidate.text) }),
    });
    if (!response.ok) return { status: "gateway_error" };
    let data: { results?: unknown };
    try {
      data = await response.json() as { results?: unknown };
    } catch {
      return { status: "invalid_response" };
    }
    if (!Array.isArray(data.results) || data.results.length !== candidates.length || !data.results.every((item) => isRerankResult(item, candidates.length))) {
      return { status: "invalid_response" };
    }
    const resultIndexes = data.results.map((item) => item.index);
    if (new Set(resultIndexes).size !== candidates.length) return { status: "invalid_response" };
    return { status: "success", scores: data.results.map((item) => ({ index: item.index, score: item.relevance_score })) };
  } catch (error) {
    return { status: error instanceof DOMException && error.name === "AbortError" ? "timeout" : "gateway_error" };
  } finally {
    clearTimeout(timer);
  }
}
