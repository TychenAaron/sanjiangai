// 本文件负责 OA 连接配置的服务端加密、脱敏输出和只读连接检测；不执行 OA 同步或资料入库。
export const OA_AUTH_TYPES = ["NONE", "BEARER_TOKEN", "API_KEY", "BASIC_AUTH", "CUSTOM_HEADER"] as const;
export type OaAuthType = (typeof OA_AUTH_TYPES)[number];
export const OA_CHECK_STATUSES = ["CONNECTED", "AUTH_FAILED", "TIMEOUT", "DNS_NETWORK_ERROR", "HTTP_ERROR", "INVALID_RESPONSE"] as const;
export type OaCheckStatus = (typeof OA_CHECK_STATUSES)[number];
export type OaCredentials = { token?: string; appKey?: string; appSecret?: string; apiKey?: string; username?: string; password?: string; customHeaderValue?: string };
export type OaConnectorInput = { name: string; baseUrl: string; endpointPath: string; requestMethod: "GET" | "HEAD"; contentType?: string; authType: OaAuthType; customAuthHeaderName?: string | null; headers?: Record<string, string>; timeoutMs?: number; enabled?: boolean; credentials?: OaCredentials; clearCredentials?: boolean };
export type PublicOaConnector = { id: string; name: string; baseUrl: string; endpointPath: string; requestMethod: string; contentType: string; authType: string; customAuthHeaderName: string | null; headers: Record<string, string>; timeoutMs: number; enabled: boolean; hasCredentials: boolean; lastCheckStatus: string | null; lastCheckHttpStatus: number | null; lastCheckDurationMs: number | null; lastCheckedAt: string | null; createdAt: string; updatedAt: string };

function bytesToBase64(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)); }
function base64ToBytes(value: string) { return Uint8Array.from(atob(value), (char) => char.charCodeAt(0)); }
async function importEncryptionKey(secret: string) {
  if (!secret.trim()) throw new Error("oa_encryption_key_missing");
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/**
 * 加密 OA 凭证。输入仅由服务端配置接口接收，输出仅写入 oa_connector_configs.credential_ciphertext。
 */
export async function encryptOaCredentials(credentials: OaCredentials, encryptionKey: string) {
  const key = await importEncryptionKey(encryptionKey); const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(credentials)));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(cipher))}`;
}

/**
 * 解密服务端保存的 OA 凭证。输入来自 D1 密文和服务端密钥；输出不得记录到日志或 API 响应。
 */
export async function decryptOaCredentials(ciphertext: string | null, encryptionKey: string): Promise<OaCredentials> {
  if (!ciphertext) return {};
  const [ivText, cipherText] = ciphertext.split("."); if (!ivText || !cipherText) throw new Error("oa_credentials_invalid");
  const key = await importEncryptionKey(encryptionKey); const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(ivText) }, key, base64ToBytes(cipherText));
  const value = JSON.parse(new TextDecoder().decode(plain)); return value && typeof value === "object" ? value as OaCredentials : {};
}

function normalizeHeaders(headers: Record<string, string> | undefined) {
  const normalized: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers || {})) {
    if (!name.trim() || /^(authorization|x-api-key|api-key)$/i.test(name.trim())) throw new Error("oa_sensitive_header_requires_credentials");
    normalized[name.trim()] = String(value);
  }
  return normalized;
}

/**
 * 校验管理员填写的连接参数。测试连接仅接受 HTTPS 和 GET/HEAD，避免配置被用于写操作或跳过 TLS。
 */
export function validateOaConnectorInput(input: OaConnectorInput) {
  if (!input.name.trim()) throw new Error("oa_name_required");
  let url: URL; try { url = new URL(input.baseUrl); } catch { throw new Error("oa_invalid_url"); }
  if (url.protocol !== "https:") throw new Error("oa_https_required");
  if (!input.endpointPath.startsWith("/")) throw new Error("oa_endpoint_required");
  if (!["GET", "HEAD"].includes(input.requestMethod)) throw new Error("oa_test_method_must_be_safe");
  if (!OA_AUTH_TYPES.includes(input.authType)) throw new Error("oa_auth_type_invalid");
  if (input.authType === "CUSTOM_HEADER" && !input.customAuthHeaderName?.trim()) throw new Error("oa_custom_header_required");
  const timeoutMs = Math.min(120_000, Math.max(500, Number(input.timeoutMs) || 15_000));
  return { baseUrl: url.toString().replace(/\/$/, ""), endpointPath: input.endpointPath, headers: normalizeHeaders(input.headers), timeoutMs };
}

/**
 * 生成安全的前端配置视图。输入为 D1 配置行；输出刻意省略 credentialCiphertext、创建人和任何凭证明文。
 */
export function toPublicOaConnector(row: { id: string; name: string; baseUrl: string; endpointPath: string; requestMethod: string; contentType: string; authType: string; customAuthHeaderName: string | null; headersJson: string; credentialCiphertext: string | null; timeoutMs: number; enabled: boolean; lastCheckStatus: string | null; lastCheckHttpStatus: number | null; lastCheckDurationMs: number | null; lastCheckedAt: string | null; createdAt: string; updatedAt: string }): PublicOaConnector {
  let headers: Record<string, string> = {}; try { const parsed = JSON.parse(row.headersJson); if (parsed && typeof parsed === "object") headers = parsed; } catch { /* malformed legacy value is not exposed */ }
  return { id: row.id, name: row.name, baseUrl: row.baseUrl, endpointPath: row.endpointPath, requestMethod: row.requestMethod, contentType: row.contentType, authType: row.authType, customAuthHeaderName: row.customAuthHeaderName, headers, timeoutMs: row.timeoutMs, enabled: row.enabled, hasCredentials: Boolean(row.credentialCiphertext), lastCheckStatus: row.lastCheckStatus, lastCheckHttpStatus: row.lastCheckHttpStatus, lastCheckDurationMs: row.lastCheckDurationMs, lastCheckedAt: row.lastCheckedAt, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

/**
 * 使用已保存配置进行只读 OA 连通性检测。输入为安全方法、脱敏头配置和仅服务端的凭证；输出只含状态、HTTP 状态和耗时。
 */
export async function testOaConnection(config: { baseUrl: string; endpointPath: string; requestMethod: "GET" | "HEAD"; contentType: string; authType: OaAuthType; customAuthHeaderName: string | null; headers: Record<string, string>; timeoutMs: number; credentials: OaCredentials }, requestFetch: typeof fetch = fetch): Promise<{ status: OaCheckStatus; httpStatus: number | null; durationMs: number }> {
  const startedAt = Date.now();
  try {
    const target = new URL(config.endpointPath, `${config.baseUrl}/`); if (target.protocol !== "https:") throw new Error("oa_invalid_url");
    const headers = new Headers(config.headers); headers.set("Accept", config.contentType || "application/json");
    if (config.authType === "BEARER_TOKEN" && config.credentials.token) headers.set("Authorization", `Bearer ${config.credentials.token}`);
    if (config.authType === "API_KEY" && config.credentials.apiKey) headers.set("X-API-Key", config.credentials.apiKey);
    if (config.authType === "BASIC_AUTH" && config.credentials.username && config.credentials.password) headers.set("Authorization", `Basic ${btoa(`${config.credentials.username}:${config.credentials.password}`)}`);
    if (config.authType === "CUSTOM_HEADER" && config.customAuthHeaderName && config.credentials.customHeaderValue) headers.set(config.customAuthHeaderName, config.credentials.customHeaderValue);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    let response: Response;
    try { response = await requestFetch(target.toString(), { method: config.requestMethod, headers, redirect: "manual", signal: controller.signal }); } finally { clearTimeout(timer); }
    const durationMs = Date.now() - startedAt;
    if (!Number.isInteger(response.status) || response.status < 100) return { status: "INVALID_RESPONSE", httpStatus: null, durationMs };
    if (response.status === 401 || response.status === 403) return { status: "AUTH_FAILED", httpStatus: response.status, durationMs };
    if (!response.ok) return { status: "HTTP_ERROR", httpStatus: response.status, durationMs };
    return { status: "CONNECTED", httpStatus: response.status, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    if (error instanceof DOMException && error.name === "AbortError") return { status: "TIMEOUT", httpStatus: null, durationMs };
    if (error instanceof Error && ["oa_invalid_url", "oa_https_required"].includes(error.message)) return { status: "INVALID_RESPONSE", httpStatus: null, durationMs };
    return { status: "DNS_NETWORK_ERROR", httpStatus: null, durationMs };
  }
}
