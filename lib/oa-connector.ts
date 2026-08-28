// 本文件提供真实 OA 对接的服务端适配边界；默认关闭，不向浏览器暴露地址、路径或授权信息。
import type { OaCheckStatus } from "./oa-connector-config";
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

// 旧同步入口保留类型兼容，但在本轮明确禁止发起网络读取；待获得具体 OA 字段映射后才可实现。
export async function fetchOaList(config: OaSyncConfig, requestFetch: typeof fetch = fetch): Promise<OaRemoteRecord[]> {
  void config; void requestFetch;
  throw new Error("oa_not_implemented");
}

// 新的可配置连接器统一能力：本轮仅开放只读 testConnection；资料读取接口明确返回未实现，不能被误认为已接通同步。
export type OaConnectorFoundation = {
  testConnection: () => Promise<{ status: OaCheckStatus; httpStatus: number | null; durationMs: number }>;
  fetchDocuments: () => Promise<{ status: "NOT_CONFIGURED" | "NOT_IMPLEMENTED" }>;
  fetchDocumentDetail: (documentId: string) => Promise<{ status: "NOT_CONFIGURED" | "NOT_IMPLEMENTED"; documentId: string }>;
};

/**
 * 创建受控 OA Connector。输入是已验证、已解密的服务端配置；输出不包含同步能力，避免测试成功被误解为已启用导入。
 */
export function createOaConnector(testConnection: OaConnectorFoundation["testConnection"], configured: boolean): OaConnectorFoundation {
  return {
    testConnection,
    fetchDocuments: async () => ({ status: configured ? "NOT_IMPLEMENTED" : "NOT_CONFIGURED" }),
    fetchDocumentDetail: async (documentId) => ({ status: configured ? "NOT_IMPLEMENTED" : "NOT_CONFIGURED", documentId }),
  };
}
