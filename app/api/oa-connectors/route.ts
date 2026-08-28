// OA 连接器配置列表和保存接口：仅系统管理员可管理，凭证始终只以加密密文保存在服务端。
import { env } from "cloudflare:workers";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLogs, oaConnectorConfigs } from "../../../db/schema";
import { accessError, requireAccessUser } from "../../../lib/access";
import { encryptOaCredentials, toPublicOaConnector, validateOaConnectorInput, type OaConnectorInput } from "../../../lib/oa-connector-config";

export const runtime = "edge";

function encryptionKey() { return (env as unknown as Record<string, string | undefined>).OA_CONFIG_ENCRYPTION_KEY || (typeof process === "undefined" ? "" : process.env.OA_CONFIG_ENCRYPTION_KEY) || ""; }

/** 读取可编辑的 OA 配置清单；只返回脱敏字段，普通员工不得读取。 */
export async function GET(request: Request) {
  try {
    const user = await requireAccessUser(request);
    if (user.role !== "system_admin") return Response.json({ error: "仅系统管理员可读取 OA 配置" }, { status: 403 });
    const rows = await getDb().select().from(oaConnectorConfigs).orderBy(desc(oaConnectorConfigs.updatedAt));
    return Response.json({ connectors: rows.map(toPublicOaConnector) });
  } catch (error) { return accessError(error, "读取 OA 配置失败"); }
}

/** 保存一份 OA 连接器配置；凭证可选，但提供时必须使用部署环境中的服务端加密密钥。 */
export async function POST(request: Request) {
  try {
    const user = await requireAccessUser(request);
    if (user.role !== "system_admin") return Response.json({ error: "仅系统管理员可保存 OA 配置" }, { status: 403 });
    const input = await request.json() as OaConnectorInput;
    const normalized = validateOaConnectorInput(input); const now = new Date().toISOString();
    const credentials = input.credentials && Object.values(input.credentials).some(Boolean) ? input.credentials : undefined;
    const credentialCiphertext = credentials ? await encryptOaCredentials(credentials, encryptionKey()) : null;
    const id = crypto.randomUUID(); const db = getDb();
    await db.insert(oaConnectorConfigs).values({ id, name: input.name.trim(), baseUrl: normalized.baseUrl, endpointPath: normalized.endpointPath, requestMethod: input.requestMethod, contentType: input.contentType?.trim() || "application/json", authType: input.authType, customAuthHeaderName: input.customAuthHeaderName?.trim() || null, headersJson: JSON.stringify(normalized.headers), credentialCiphertext, timeoutMs: normalized.timeoutMs, enabled: Boolean(input.enabled), createdBy: user.id, createdAt: now, updatedAt: now });
    await db.insert(auditLogs).values({ id: crypto.randomUUID(), action: "oa_connector_config_saved", entityType: "oa_connector_config", entityId: id, operator: user.id, detail: "OA 连接器配置已保存；未记录地址或凭证。", createdAt: now });
    const [saved] = await db.select().from(oaConnectorConfigs).where(eq(oaConnectorConfigs.id, id));
    return Response.json({ connector: saved && toPublicOaConnector(saved) }, { status: 201 });
  } catch (error) { return accessError(error, "保存 OA 配置失败"); }
}
