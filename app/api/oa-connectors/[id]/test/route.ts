// OA 连通性检测接口：仅管理员可调用，固定使用已保存的 GET/HEAD 配置，不产生写操作或同步。
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { auditLogs, oaConnectorConfigs } from "../../../../../db/schema";
import { accessError, requireAccessUser } from "../../../../../lib/access";
import { decryptOaCredentials, testOaConnection, type OaAuthType } from "../../../../../lib/oa-connector-config";

export const runtime = "edge";
function encryptionKey() { return (env as unknown as Record<string, string | undefined>).OA_CONFIG_ENCRYPTION_KEY || (typeof process === "undefined" ? "" : process.env.OA_CONFIG_ENCRYPTION_KEY) || ""; }

/** 测试已保存 OA 配置的只读连通性，输出仅含状态、HTTP 状态、耗时和检测时间。 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAccessUser(request); if (user.role !== "system_admin") return Response.json({ error: "仅系统管理员可测试 OA 连接" }, { status: 403 }); const { id } = await context.params; const db = getDb(); const [config] = await db.select().from(oaConnectorConfigs).where(eq(oaConnectorConfigs.id, id)).limit(1); if (!config || !config.enabled) return Response.json({ status: "INVALID_RESPONSE", message: "OA 配置不存在或未启用" }, { status: 409 });
    let headers: Record<string, string> = {}; try { headers = JSON.parse(config.headersJson) as Record<string, string>; } catch { return Response.json({ status: "INVALID_RESPONSE", message: "OA Header 配置无效" }, { status: 409 }); }
    const credentials = await decryptOaCredentials(config.credentialCiphertext, encryptionKey()); const result = await testOaConnection({ baseUrl: config.baseUrl, endpointPath: config.endpointPath, requestMethod: config.requestMethod as "GET" | "HEAD", contentType: config.contentType, authType: config.authType as OaAuthType, customAuthHeaderName: config.customAuthHeaderName, headers, timeoutMs: config.timeoutMs, credentials }); const checkedAt = new Date().toISOString();
    await db.update(oaConnectorConfigs).set({ lastCheckStatus: result.status, lastCheckHttpStatus: result.httpStatus, lastCheckDurationMs: result.durationMs, lastCheckedAt: checkedAt, updatedAt: checkedAt }).where(eq(oaConnectorConfigs.id, id)); await db.insert(auditLogs).values({ id: crypto.randomUUID(), action: "oa_connector_tested", entityType: "oa_connector_config", entityId: id, operator: user.id, detail: `OA 连接检测：${result.status}，耗时 ${result.durationMs}ms。`, createdAt: checkedAt }); return Response.json({ ...result, checkedAt });
  } catch (error) { return accessError(error, "OA 连接检测失败"); }
}
