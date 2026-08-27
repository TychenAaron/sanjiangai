// 此内部入口预留给系统管理员或受信任任务执行 OA 同步；默认关闭且不返回 OA 配置、正文或密钥。
import { env } from "cloudflare:workers";
import { accessError, requireAccessUser } from "../../../../lib/access";
import { fetchOaList, readOaSyncConfig, resolveOaRuntime } from "../../../../lib/oa-connector";

export const runtime = "edge";

// 输入为已认证请求；仅管理员且明确启用后才请求 OA，当前只返回最小同步摘要，资料入库映射留待 OA 字段确认后启用。
export async function POST(request: Request) {
  try {
    const user = await requireAccessUser(request);
    if (user.role !== "system_admin") return Response.json({ error: "仅系统管理员可以触发 OA 同步" }, { status: 403 });
    const worker = env as unknown as Record<string, string | undefined>;
    const node = typeof process === "undefined" ? {} : process.env;
    const config = readOaSyncConfig(resolveOaRuntime(worker, node));
    if (!config.enabled || !config.configured) return Response.json({ error: "OA 同步尚未配置" }, { status: 503 });
    const records = await fetchOaList(config);
    return Response.json({ ok: true, fetched: records.length, imported: 0, message: "OA 清单已读取；待确认实际字段映射后再启用入库。" });
  } catch (error) { return accessError(error, "OA 同步失败"); }
}
