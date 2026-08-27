// 本文件提供真实 OA 对接的服务端适配边界；默认关闭，不向浏览器暴露地址、路径或授权信息。
export type OaRuntime = Record<string, string | undefined>;
export type OaSyncConfig = { enabled: boolean; configured: boolean; baseUrl: string; listPath: string; detailPath: string; downloadPath: string; authType: "none" | "bearer" | "api_key"; secret: string; timeoutMs: number };
export type OaRemoteRecord = { id: string; title: string; sourceOrganization?: string; documentDate?: string; versionMarker?: string; content?: string };
const OA_KEYS = ["OA_SYNC_ENABLED", "OA_BASE_URL", "OA_LIST_PATH", "OA_DETAIL_PATH", "OA_DOWNLOAD_PATH", "OA_AUTH_TYPE", "OA_ACCESS_TOKEN", "OA_API_KEY", "OA_REQUEST_TIMEOUT_MS"] as const;

// 合并 Worker binding 与 Node 环境变量。输入只在服务端使用，输出不得写日志或 API 响应。
export function resolveOaRuntime(worker: OaRuntime, node: OaRuntime): OaRuntime { return Object.fromEntries(OA_KEYS.map((key) => [key, worker[key]?.trim() || node[key]?.trim() || undefined])); }

// 读取 OA 配置并校验开关、路径和授权类型；未启用或缺项时调用方不得发起网络请求。
export function readOaSyncConfig(runtime: OaRuntime): OaSyncConfig {
  const enabled = runtime.OA_SYNC_ENABLED?.toLowerCase() === "true";
  const baseUrl = runtime.OA_BASE_URL?.replace(/\/$/, "") || "";
  const authType = runtime.OA_AUTH_TYPE === "bearer" || runtime.OA_AUTH_TYPE === "api_key" ? runtime.OA_AUTH_TYPE : "none";
  const secret = authType === "bearer" ? runtime.OA_ACCESS_TOKEN || "" : authType === "api_key" ? runtime.OA_API_KEY || "" : "";
  const timeout = Number(runtime.OA_REQUEST_TIMEOUT_MS);
  return { enabled, configured: Boolean(baseUrl && runtime.OA_LIST_PATH && (authType === "none" || secret)), baseUrl, listPath: runtime.OA_LIST_PATH || "", detailPath: runtime.OA_DETAIL_PATH || "", downloadPath: runtime.OA_DOWNLOAD_PATH || "", authType, secret, timeoutMs: Number.isFinite(timeout) && timeout >= 500 ? Math.min(timeout, 120_000) : 15_000 };
}

// 仅在已启用且完整配置时调用 OA 清单接口；字段映射集中在本函数，OA 实际字段变化时只改这里。
export async function fetchOaList(config: OaSyncConfig, requestFetch: typeof fetch = fetch): Promise<OaRemoteRecord[]> {
  if (!config.enabled || !config.configured) throw new Error("oa_not_configured");
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (config.authType === "bearer") headers.Authorization = `Bearer ${config.secret}`;
    if (config.authType === "api_key") headers["X-API-Key"] = config.secret;
    const response = await requestFetch(`${config.baseUrl}${config.listPath}`, { headers, signal: controller.signal });
    if (!response.ok) throw new Error(`oa_http_${response.status}`);
    const payload = await response.json() as { records?: unknown[]; data?: unknown[] } | unknown[];
    const rows = Array.isArray(payload) ? payload : payload.records || payload.data || [];
    return rows.flatMap((row): OaRemoteRecord[] => { const value = row as Record<string, unknown>; const id = String(value.id || value.recordId || "").trim(); const title = String(value.title || value.subject || "").trim(); return id && title ? [{ id, title, sourceOrganization: typeof value.sourceOrganization === "string" ? value.sourceOrganization : undefined, documentDate: typeof value.documentDate === "string" ? value.documentDate : undefined, versionMarker: typeof value.version === "string" ? value.version : undefined, content: typeof value.content === "string" ? value.content : undefined }] : []; });
  } finally { clearTimeout(timer); }
}
