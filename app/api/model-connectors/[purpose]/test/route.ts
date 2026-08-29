// 模型连接检测 API：仅 system_admin 可执行，使用最小无业务内容请求并只返回分类状态、HTTP 状态与耗时。
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { auditLogs, modelConnectorConfigs } from "../../../../../db/schema";
import { accessError, requireAccessUser } from "../../../../../lib/access";
import { decryptModelApiKey, MODEL_PURPOSES, testModelConnector, toPublicModelConnector, type ModelPurpose } from "../../../../../lib/model-connector-config";
import { getRequestId, writeStructuredLog } from "../../../../../lib/runtime-observability";

export const runtime = "edge";
function encryptionKey() { return (env as unknown as Record<string, string | undefined>).MODEL_CONFIG_ENCRYPTION_KEY || (typeof process === "undefined" ? "" : process.env.MODEL_CONFIG_ENCRYPTION_KEY) || ""; }

/** 读取已保存配置并进行只读连通性检测；绝不返回或记录 API Key。 */
export async function POST(request: Request, context: { params: Promise<{ purpose: string }> }) {
  const startedAt = Date.now();
  try {
    const user = await requireAccessUser(request); if (user.role !== "system_admin") return Response.json({ error: "仅系统管理员可测试模型连接" }, { status: 403 });
    const { purpose } = await context.params; if (!MODEL_PURPOSES.includes(purpose as ModelPurpose)) return Response.json({ error: "模型用途无效" }, { status: 400 });
    const db = getDb(); const [config] = await db.select().from(modelConnectorConfigs).where(eq(modelConnectorConfigs.purpose, purpose)).limit(1);
    if (!config) return Response.json({ check: { status: "UNCONFIGURED", httpStatus: null, durationMs: 0 } });
    const apiKey = await decryptModelApiKey(config.credentialCiphertext, encryptionKey()); const check = await testModelConnector({ ...config, purpose: purpose as ModelPurpose }, apiKey); const now = new Date().toISOString();
    await db.update(modelConnectorConfigs).set({ lastCheckStatus: check.status, lastCheckHttpStatus: check.httpStatus, lastCheckDurationMs: check.durationMs, lastCheckedAt: now, updatedAt: now }).where(eq(modelConnectorConfigs.id, config.id));
    const requestId = getRequestId(request); await db.insert(auditLogs).values({ id: crypto.randomUUID(), action: "model_connector_tested", entityType: "model_connector_config", entityId: config.id, operator: user.id, detail: `purpose=${purpose}; status=${check.status}; latency_ms=${check.durationMs}; request_id=${requestId}`, requestId, createdAt: now });
    writeStructuredLog({ requestId, route: "model.connectors.test", user, result: check.status, latencyMs: Date.now() - startedAt, errorCode: check.status === "CONNECTED" ? undefined : check.status.toLowerCase() });
    const [saved] = await db.select().from(modelConnectorConfigs).where(eq(modelConnectorConfigs.id, config.id));
    return Response.json({ check, connector: saved && toPublicModelConnector(saved) });
  } catch (error) { return accessError(error, "模型连接测试失败"); }
}
