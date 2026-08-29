// 运行时模型配置解析：每次新请求优先读取管理员在 D1 保存的脱敏配置，数据库没有对应配置时才回退 Worker/process 环境变量。
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { modelConnectorConfigs } from "../db/schema";
import { decryptModelApiKey, type ModelPurpose } from "./model-connector-config";

function encryptionKey() { return (env as unknown as Record<string, string | undefined>).MODEL_CONFIG_ENCRYPTION_KEY || (typeof process === "undefined" ? "" : process.env.MODEL_CONFIG_ENCRYPTION_KEY) || ""; }

/** 读取一个模型用途的数据库配置；无配置或密文不可解时返回 null，让既有环境变量回退继续生效。 */
export async function readRuntimeModelOverride(purpose: ModelPurpose) {
  try {
    const [row] = await getDb().select().from(modelConnectorConfigs).where(eq(modelConnectorConfigs.purpose, purpose)).limit(1);
    if (!row) return null;
    const apiKey = await decryptModelApiKey(row.credentialCiphertext, encryptionKey());
    return { enabled: row.enabled, baseUrl: row.baseUrl, model: row.model, apiKey, timeoutMs: row.timeoutMs, endpointPath: row.endpointPath || undefined };
  } catch { return null; }
}

/** 以数据库优先策略合成知识问答主模型运行时变量，输出仍是既有 gateway 的环境变量形状。 */
export async function resolveMainModelRuntime(fallback: Record<string, string | undefined>) {
  const config = await readRuntimeModelOverride("MAIN_MODEL");
  return config ? { ...fallback, MODEL_GATEWAY_BASE_URL: config.baseUrl, MODEL_GATEWAY_MODEL: config.model, MODEL_GATEWAY_API_KEY: config.apiKey, MODEL_GATEWAY_TIMEOUT_MS: String(config.timeoutMs), MODEL_GATEWAY_ENABLED: String(config.enabled) } : fallback;
}

/** 以数据库优先策略合成 WritingV2 网关运行时变量；关闭的数据库配置明确禁用写作模型。 */
export async function resolveWritingRuntime(fallback: Record<string, string | undefined>) {
  const config = await readRuntimeModelOverride("MAIN_MODEL");
  return config ? { ...fallback, AI_MODEL_ENABLED: String(config.enabled), AI_GATEWAY_BASE_URL: config.baseUrl, AI_WRITING_MODEL: config.model, AI_GATEWAY_API_KEY: config.apiKey, AI_MODEL_TIMEOUT_MS: String(config.timeoutMs) } : fallback;
}

/** 以数据库优先策略合成 Embedding/Reranker 网关变量，未配置时保留原有降级逻辑。 */
export async function resolveRetrievalModelRuntime(fallback: Record<string, string | undefined>, purpose: "EMBEDDING" | "RERANKER") {
  const config = await readRuntimeModelOverride(purpose);
  if (!config) return fallback;
  return purpose === "EMBEDDING"
    ? { ...fallback, EMBEDDING_BASE_URL: config.baseUrl, EMBEDDING_MODEL: config.model, EMBEDDING_API_KEY: config.apiKey, EMBEDDING_TIMEOUT_MS: String(config.timeoutMs) }
    : { ...fallback, RERANKER_BASE_URL: config.baseUrl, RERANKER_MODEL: config.model, RERANKER_API_KEY: config.apiKey, RERANKER_TIMEOUT_MS: String(config.timeoutMs), RERANKER_PATH: config.endpointPath || "/rerank" };
}

/**
 * 读取 OCR 服务运行时配置。优先级为 D1 管理员配置、Worker/process 环境变量、项目内本地默认地址。
 * 输入为环境变量回退值，输出只供服务端 OCR 客户端使用，绝不下发凭证到浏览器。
 */
export async function resolveOcrRuntime(fallback: Record<string, string | undefined>) {
  const config = await readRuntimeModelOverride("OCR");
  if (config) return { baseUrl: config.baseUrl, endpointPath: config.endpointPath || "/ocr", apiKey: config.apiKey, timeoutMs: config.timeoutMs, enabled: config.enabled };
  const timeoutMs = Number(fallback.OCR_TIMEOUT_MS || 60_000);
  return {
    baseUrl: fallback.OCR_BASE_URL || "http://127.0.0.1:8765",
    endpointPath: fallback.OCR_ENDPOINT || "/ocr",
    apiKey: fallback.OCR_API_KEY || "",
    timeoutMs: Number.isFinite(timeoutMs) ? Math.min(Math.max(timeoutMs, 500), 120_000) : 60_000,
    enabled: fallback.OCR_ENABLED !== "false",
  };
}
