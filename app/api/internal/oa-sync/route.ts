// 此内部入口保留未来受信任任务边界；本轮没有同步实现，绝不请求 OA 或写入正式知识库。
import { env } from "cloudflare:workers";
import { accessError, requireAccessUser } from "../../../../lib/access";
import { readOaSyncConfig, resolveOaRuntime } from "../../../../lib/oa-connector";

export const runtime = "edge";

// 输入为已认证请求；即使管理员已配置连接，本轮也只返回未实现状态，不请求 OA、不创建资料。
export async function POST(request: Request) {
  try {
    const user = await requireAccessUser(request);
    if (user.role !== "system_admin") return Response.json({ error: "仅系统管理员可以触发 OA 同步" }, { status: 403 });
    const worker = env as unknown as Record<string, string | undefined>;
    const node = typeof process === "undefined" ? {} : process.env;
    const config = readOaSyncConfig(resolveOaRuntime(worker, node));
    if (!config.enabled || !config.configured) return Response.json({ error: "OA 同步尚未配置" }, { status: 503 });
    return Response.json({ error: "OA 同步尚未实现；当前仅支持受控连接检测。" }, { status: 501 });
  } catch (error) { return accessError(error, "OA 同步失败"); }
}
