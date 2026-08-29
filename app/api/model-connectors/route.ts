// 模型连接配置 API：仅 system_admin 可保存或读取脱敏配置，数据库配置将供后续写作与知识问答请求实时读取。
import { env } from "cloudflare:workers";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLogs, modelConnectorConfigs } from "../../../db/schema";
import { accessError, requireAccessUser } from "../../../lib/access";
import { encryptModelApiKey, toPublicModelConnector, validateModelConnectorInput, type ModelConnectorInput } from "../../../lib/model-connector-config";
import { getRequestId, writeStructuredLog } from "../../../lib/runtime-observability";

export const runtime = "edge";
function encryptionKey() { return (env as unknown as Record<string, string | undefined>).MODEL_CONFIG_ENCRYPTION_KEY || (typeof process === "undefined" ? "" : process.env.MODEL_CONFIG_ENCRYPTION_KEY) || ""; }

/** 返回管理员可见的模型配置摘要，永不返回 API Key 密文或明文。 */
export async function GET(request: Request) {
  try {
    const user = await requireAccessUser(request); if (user.role !== "system_admin") return Response.json({ error: "仅系统管理员可读取模型配置" }, { status: 403 });
    const connectors = await getDb().select().from(modelConnectorConfigs).orderBy(desc(modelConnectorConfigs.updatedAt));
    return Response.json({ connectors: connectors.map(toPublicModelConnector) });
  } catch (error) { return accessError(error, "读取模型配置失败"); }
}

/** 保存或更新一种模型用途的配置；有新 API Key 时才替换已有密文，空值不会意外清空凭证。 */
export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const user = await requireAccessUser(request); if (user.role !== "system_admin") return Response.json({ error: "仅系统管理员可维护模型配置" }, { status: 403 });
    const input = await request.json() as ModelConnectorInput; const normalized = validateModelConnectorInput(input); const db = getDb(); const now = new Date().toISOString();
    const [existing] = await db.select().from(modelConnectorConfigs).where(eq(modelConnectorConfigs.purpose, input.purpose)).limit(1);
    const credentialCiphertext = input.apiKey?.trim() ? await encryptModelApiKey(input.apiKey, encryptionKey()) : existing?.credentialCiphertext ?? null;
    const values = { baseUrl: normalized.baseUrl, model: normalized.model, credentialCiphertext, timeoutMs: normalized.timeoutMs, endpointPath: normalized.endpointPath, enabled: Boolean(input.enabled), updatedAt: now };
    const id = existing?.id || crypto.randomUUID();
    if (existing) await db.update(modelConnectorConfigs).set(values).where(eq(modelConnectorConfigs.id, existing.id));
    else await db.insert(modelConnectorConfigs).values({ id, purpose: input.purpose, ...values, createdBy: user.id, createdAt: now });
    const requestId = getRequestId(request);
    await db.insert(auditLogs).values({ id: crypto.randomUUID(), action: "model_connector_config_saved", entityType: "model_connector_config", entityId: id, operator: user.id, detail: `purpose=${input.purpose}; has_credentials=${Boolean(credentialCiphertext)}; request_id=${requestId}`, requestId, createdAt: now });
    writeStructuredLog({ requestId, route: "model.connectors.save", user, result: "success", latencyMs: Date.now() - startedAt });
    const [saved] = await db.select().from(modelConnectorConfigs).where(eq(modelConnectorConfigs.id, id));
    return Response.json({ connector: saved && toPublicModelConnector(saved) }, { status: existing ? 200 : 201 });
  } catch (error) { return accessError(error, "保存模型配置失败"); }
}
