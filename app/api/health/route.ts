// 最小健康检查接口：报告服务、D1、必要绑定和写作模型配置，不调用模型、OA 或业务资料。
import { env } from "cloudflare:workers";
import { sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { observedError, observeResponse } from "../../../lib/runtime-observability";
import { readWritingModelConfig, resolveWritingModelRuntime } from "../../../lib/writing-model-gateway";

export const runtime = "edge";

/**
 * 返回服务 readiness。输入为无需登录的健康请求；输出只含可用性布尔值与模型是否配置，绝不返回网关地址或密钥。
 */
export async function GET(request: Request) {
  const startedAt = Date.now();
  try {
    let d1Available = false;
    try { await getDb().run(sql`SELECT 1`); d1Available = true; } catch { d1Available = false; }
    const model = readWritingModelConfig(resolveWritingModelRuntime({ AI_MODEL_ENABLED: env.AI_MODEL_ENABLED, AI_GATEWAY_BASE_URL: env.AI_GATEWAY_BASE_URL, AI_GATEWAY_API_KEY: env.AI_GATEWAY_API_KEY, AI_WRITING_MODEL: env.AI_WRITING_MODEL, AI_MODEL_TIMEOUT_MS: env.AI_MODEL_TIMEOUT_MS }, typeof process === "undefined" ? {} : process.env));
    const requiredBindings = { d1: Boolean(env.DB) };
    const alive = true; const ready = d1Available && requiredBindings.d1;
    return observeResponse(request, "health", startedAt, Response.json({ alive, ready, d1: d1Available ? "available" : "unavailable", bindings: requiredBindings, modelGateway: model.enabled && model.configured ? "configured" : "unconfigured" }, { status: ready ? 200 : 503 }));
  } catch {
    return observedError(request, "health", startedAt, 503, "服务健康检查失败", "health_check_failed");
  }
}
