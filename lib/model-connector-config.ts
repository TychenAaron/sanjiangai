// 治理后台模型连接配置：负责校验、凭证加密、脱敏展示和 OpenAI-compatible 连通性检测，不记录密钥、提示词或业务正文。
export const MODEL_PURPOSES = ["MAIN_MODEL", "EMBEDDING", "RERANKER"] as const;
export type ModelPurpose = typeof MODEL_PURPOSES[number];
export type ModelConnectorInput = { purpose: ModelPurpose; baseUrl: string; model: string; apiKey?: string; timeoutMs?: number; endpointPath?: string; enabled?: boolean };

const MAX_TIMEOUT_MS = 120_000;

/** 校验管理员提交的模型连接配置；只允许 HTTP(S) 网关，禁止把凭证嵌入 URL。 */
export function validateModelConnectorInput(input: ModelConnectorInput) {
  if (!MODEL_PURPOSES.includes(input.purpose) || !input.baseUrl?.trim() || !input.model?.trim()) throw new Error("model_config_invalid");
  let parsed: URL;
  try { parsed = new URL(input.baseUrl.trim()); } catch { throw new Error("model_config_invalid"); }
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) throw new Error("model_config_invalid");
  const timeout = Number(input.timeoutMs ?? 15_000);
  if (!Number.isFinite(timeout) || timeout < 500 || timeout > MAX_TIMEOUT_MS) throw new Error("model_config_invalid");
  const endpointPath = (input.endpointPath || "/rerank").trim();
  if (input.purpose === "RERANKER" && (!endpointPath.startsWith("/") || endpointPath.includes("://"))) throw new Error("model_config_invalid");
  return { baseUrl: parsed.toString().replace(/\/$/, ""), model: input.model.trim(), timeoutMs: Math.round(timeout), endpointPath: input.purpose === "RERANKER" ? endpointPath : null };
}

function toBase64(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)); }
function fromBase64(value: string) { return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)); }

/** 以部署密钥加密 API Key；输入为空时不产生密文，输出不会泄漏原始凭证。 */
export async function encryptModelApiKey(apiKey: string, encryptionKey: string) {
  if (!apiKey.trim()) return null;
  if (encryptionKey.length < 16) throw new Error("model_config_encryption_key_missing");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(encryptionKey));
  const key = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(apiKey));
  return `${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

/** 解密仅在服务端发起模型请求或连接检测前执行，输出不会写入日志、审计或 API 响应。 */
export async function decryptModelApiKey(ciphertext: string | null, encryptionKey: string) {
  if (!ciphertext) return "";
  if (encryptionKey.length < 16) throw new Error("model_config_encryption_key_missing");
  const [ivText, dataText] = ciphertext.split(".");
  if (!ivText || !dataText) throw new Error("model_config_decrypt_failed");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(encryptionKey));
  const key = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(ivText) }, key, fromBase64(dataText));
  return new TextDecoder().decode(plain);
}

/** 将数据库行转换为浏览器可见的脱敏配置；密文与 API Key 永不下发。 */
type StoredModelConnector = { id: string; purpose: string; baseUrl: string; model: string; credentialCiphertext: string | null; timeoutMs: number; endpointPath: string | null; enabled: boolean; lastCheckStatus: string | null; lastCheckHttpStatus: number | null; lastCheckDurationMs: number | null; lastCheckedAt: string | null; updatedAt: string };
export function toPublicModelConnector(row: StoredModelConnector) {
  return { id: row.id, purpose: row.purpose, baseUrl: row.baseUrl, model: row.model, timeoutMs: row.timeoutMs, endpointPath: row.endpointPath, enabled: row.enabled,
    hasCredentials: Boolean(row.credentialCiphertext), lastCheckStatus: row.lastCheckStatus, lastCheckHttpStatus: row.lastCheckHttpStatus, lastCheckDurationMs: row.lastCheckDurationMs, lastCheckedAt: row.lastCheckedAt, updatedAt: row.updatedAt };
}

export type ModelCheck = { status: "CONNECTED" | "AUTH_FAILED" | "TIMEOUT" | "HTTP_ERROR" | "INVALID_RESPONSE" | "UNCONFIGURED"; httpStatus: number | null; durationMs: number };

/** 调用配置的最小只读模型端点进行检测；不传递任何集团资料或私有正文。 */
export async function testModelConnector(config: { purpose: ModelPurpose; baseUrl: string; model: string; timeoutMs: number; endpointPath: string | null; enabled: boolean }, apiKey: string, gatewayFetch: typeof fetch = fetch): Promise<ModelCheck> {
  if (!config.enabled || !config.baseUrl || !config.model) return { status: "UNCONFIGURED", httpStatus: null, durationMs: 0 };
  const controller = new AbortController(); const startedAt = Date.now(); const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const path = config.purpose === "MAIN_MODEL" ? "/chat/completions" : config.purpose === "EMBEDDING" ? "/embeddings" : (config.endpointPath || "/rerank");
    const body = config.purpose === "MAIN_MODEL" ? { model: config.model, messages: [{ role: "user", content: "只回复：MODEL_OK" }], max_tokens: 8 }
      : config.purpose === "EMBEDDING" ? { model: config.model, input: ["连接检测"] }
        : { model: config.model, query: "连接检测", documents: ["测试候选资料"] };
    const response = await gatewayFetch(`${config.baseUrl}${path}`, { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) }, body: JSON.stringify(body) });
    const durationMs = Date.now() - startedAt;
    if (response.status === 401 || response.status === 403) return { status: "AUTH_FAILED", httpStatus: response.status, durationMs };
    if (!response.ok) return { status: "HTTP_ERROR", httpStatus: response.status, durationMs };
    let data: unknown; try { data = await response.json(); } catch { return { status: "INVALID_RESPONSE", httpStatus: response.status, durationMs }; }
    const payload = data as { choices?: Array<{ message?: { content?: unknown } }>; data?: Array<{ embedding?: unknown }>; results?: unknown };
    const valid = config.purpose === "MAIN_MODEL" ? typeof payload.choices?.[0]?.message?.content === "string" && payload.choices[0].message.content.trim().length > 0
      : config.purpose === "EMBEDDING" ? Array.isArray(payload.data) && Array.isArray(payload.data[0]?.embedding) && payload.data[0].embedding.length > 0
        : Array.isArray(payload.results) && payload.results.length > 0;
    return { status: valid ? "CONNECTED" : "INVALID_RESPONSE", httpStatus: response.status, durationMs };
  } catch (error) { return { status: error instanceof DOMException && error.name === "AbortError" ? "TIMEOUT" : "HTTP_ERROR", httpStatus: null, durationMs: Date.now() - startedAt }; }
  finally { clearTimeout(timer); }
}
