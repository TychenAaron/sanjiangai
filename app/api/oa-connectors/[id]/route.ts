// 单个 OA 连接器配置接口：仅系统管理员可读取或编辑，任何响应均不包含凭证明文或密文。
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { auditLogs, oaConnectorConfigs } from "../../../../db/schema";
import { accessError, requireAccessUser } from "../../../../lib/access";
import { encryptOaCredentials, toPublicOaConnector, validateOaConnectorInput, type OaConnectorInput } from "../../../../lib/oa-connector-config";
import { getRequestId, writeStructuredLog } from "../../../../lib/runtime-observability";

export const runtime = "edge";
function encryptionKey() { return (env as unknown as Record<string, string | undefined>).OA_CONFIG_ENCRYPTION_KEY || (typeof process === "undefined" ? "" : process.env.OA_CONFIG_ENCRYPTION_KEY) || ""; }

/** 读取一个脱敏后的 OA 配置，输入为管理员和配置 ID，输出不含任何凭证。 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const user = await requireAccessUser(request); if (user.role !== "system_admin") return Response.json({ error: "仅系统管理员可读取 OA 配置" }, { status: 403 }); const { id } = await context.params; const [row] = await getDb().select().from(oaConnectorConfigs).where(eq(oaConnectorConfigs.id, id)).limit(1); return row ? Response.json({ connector: toPublicOaConnector(row) }) : Response.json({ error: "OA 配置不存在" }, { status: 404 }); } catch (error) { return accessError(error, "读取 OA 配置失败"); }
}

/** 更新一份 OA 配置；只有明确提交 credentials 才替换密文，clearCredentials 可安全清空已保存凭证。 */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAccessUser(request); if (user.role !== "system_admin") return Response.json({ error: "仅系统管理员可编辑 OA 配置" }, { status: 403 });
    const { id } = await context.params; const input = await request.json() as OaConnectorInput; const normalized = validateOaConnectorInput(input); const db = getDb(); const [existing] = await db.select().from(oaConnectorConfigs).where(eq(oaConnectorConfigs.id, id)).limit(1); if (!existing) return Response.json({ error: "OA 配置不存在" }, { status: 404 });
    const hasCredentials = input.credentials && Object.values(input.credentials).some(Boolean); const credentialCiphertext = input.clearCredentials ? null : hasCredentials ? await encryptOaCredentials(input.credentials!, encryptionKey()) : existing.credentialCiphertext; const now = new Date().toISOString();
    await db.update(oaConnectorConfigs).set({ name: input.name.trim(), baseUrl: normalized.baseUrl, endpointPath: normalized.endpointPath, requestMethod: input.requestMethod, contentType: input.contentType?.trim() || "application/json", authType: input.authType, customAuthHeaderName: input.customAuthHeaderName?.trim() || null, headersJson: JSON.stringify(normalized.headers), credentialCiphertext, timeoutMs: normalized.timeoutMs, enabled: Boolean(input.enabled), updatedAt: now }).where(eq(oaConnectorConfigs.id, id));
    const requestId = getRequestId(request); await db.insert(auditLogs).values({ id: crypto.randomUUID(), action: "oa_connector_config_updated", entityType: "oa_connector_config", entityId: id, operator: user.id, detail: `OA 连接器配置已更新；未记录地址或凭证。｜request_id=${requestId}`, requestId, createdAt: now }); writeStructuredLog({ requestId, user, route: "oa.connectors.update", result: "success", latencyMs: 0 }); const [saved] = await db.select().from(oaConnectorConfigs).where(eq(oaConnectorConfigs.id, id)); return Response.json({ connector: saved && toPublicOaConnector(saved) });
  } catch (error) { return accessError(error, "更新 OA 配置失败"); }
}
