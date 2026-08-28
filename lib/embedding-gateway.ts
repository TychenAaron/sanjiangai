// 本文件提供服务端 OpenAI-compatible Embedding 网关与仅供离线验证的确定性向量，不绑定任何厂商地址。

export type EmbeddingRuntime = Record<string, string | undefined>;

export type EmbeddingGatewayConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  configured: boolean;
};

export type EmbeddingFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type EmbeddingResult =
  | { status: "success"; vectors: number[][] }
  | { status: "not_configured" | "timeout" | "gateway_error" | "invalid_response" };

const DEFAULT_MODEL = "Qwen3-Embedding-4B";
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_INPUTS = 32;

// 读取服务端配置。输入为 Worker binding 或 process.env 等价对象，输出不向浏览器、日志或审计暴露密钥。
export function readEmbeddingGatewayConfig(runtime: EmbeddingRuntime): EmbeddingGatewayConfig {
  const baseUrl = runtime.EMBEDDING_BASE_URL?.trim().replace(/\/$/, "") || "";
  const configuredTimeout = Number(runtime.EMBEDDING_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout >= 500 && configuredTimeout <= MAX_TIMEOUT_MS
    ? configuredTimeout
    : DEFAULT_TIMEOUT_MS;

  return {
    baseUrl,
    apiKey: runtime.EMBEDDING_API_KEY?.trim() || "",
    model: runtime.EMBEDDING_MODEL?.trim() || DEFAULT_MODEL,
    timeoutMs,
    configured: Boolean(baseUrl),
  };
}

function isVector(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 8_192 && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

// 调用 OpenAI-compatible /embeddings。输入仅能来自已获准的资料分段或当前用户查询，失败时不产生替代向量。
export async function embedTexts(
  config: EmbeddingGatewayConfig,
  inputs: string[],
  gatewayFetch: EmbeddingFetch = fetch,
): Promise<EmbeddingResult> {
  if (!config.configured) return { status: "not_configured" };
  if (!inputs.length || inputs.length > MAX_INPUTS || inputs.some((input) => !input.trim())) return { status: "invalid_response" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await gatewayFetch(`${config.baseUrl}/embeddings`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: config.model, input: inputs }),
    });
    if (!response.ok) return { status: "gateway_error" };
    let data: { data?: Array<{ embedding?: unknown; index?: unknown }> };
    try {
      data = await response.json() as { data?: Array<{ embedding?: unknown; index?: unknown }> };
    } catch {
      return { status: "invalid_response" };
    }
    if (!Array.isArray(data.data) || data.data.length !== inputs.length) return { status: "invalid_response" };
    const vectors = [...data.data]
      .sort((left, right) => Number(left.index ?? 0) - Number(right.index ?? 0))
      .map((item) => item.embedding);
    if (!vectors.every(isVector) || new Set(vectors.map((vector) => vector.length)).size !== 1) return { status: "invalid_response" };
    return { status: "success", vectors };
  } catch (error) {
    return { status: error instanceof DOMException && error.name === "AbortError" ? "timeout" : "gateway_error" };
  } finally {
    clearTimeout(timer);
  }
}

// 仅供离线虚构验证生成稳定向量，不被运行时索引或检索调用，不能视为生产 Embedding 能力。
export function createDeterministicOfflineEmbedding(input: string, dimensions = 96) {
  const vector = Array.from({ length: dimensions }, () => 0);
  const normalized = input.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  for (let index = 0; index < normalized.length; index += 1) {
    const token = normalized.slice(index, index + 3);
    if (!token) continue;
    let hash = 2_166_136_261;
    for (const character of token) hash = Math.imul(hash ^ character.codePointAt(0)!, 16_777_619);
    vector[(hash >>> 0) % dimensions] += 1;
  }
  const magnitude = Math.hypot(...vector);
  return magnitude ? vector.map((value) => value / magnitude) : vector;
}
