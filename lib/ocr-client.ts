// 项目内 OCR HTTP 客户端：读取受控运行时配置，把扫描 PDF/图片发送给本机 PaddleOCR 服务；不记录正文、文件字节或凭证。
import { env } from "cloudflare:workers";
import { parseOcrResponse, type ParsedDocument } from "./document-parser";
import { resolveOcrRuntime } from "./runtime-model-config";

type OcrPayload = { text?: unknown; pages?: unknown; tables?: unknown; metadata?: unknown };

/**
 * 调用受控 OCR 服务。输入为已完成签名校验的原始文件，输出标准解析结果；服务不可用时返回待 OCR 状态而不阻塞文件入库。
 * 读取 D1 模型连接配置或环境变量，不向浏览器暴露 OCR 地址之外的服务端凭证。
 */
export async function parseWithOcr(input: { fileName: string; mimeType?: string; buffer: ArrayBuffer }): Promise<ParsedDocument> {
  const runtime = await resolveOcrRuntime(env as unknown as Record<string, string | undefined>);
  if (!runtime.enabled) return parseOcrResponse(input.fileName, { text: "", pages: [], tables: [], metadata: {} }, "OCR 服务已停用，等待管理员重新解析");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), runtime.timeoutMs);
  try {
    const form = new FormData();
    form.append("file", new File([input.buffer], input.fileName, { type: input.mimeType || "application/pdf" }));
    const response = await fetch(`${runtime.baseUrl}${runtime.endpointPath}`, { method: "POST", body: form, signal: controller.signal, headers: runtime.apiKey ? { Authorization: `Bearer ${runtime.apiKey}` } : undefined });
    if (!response.ok) return parseOcrResponse(input.fileName, { text: "", pages: [], tables: [], metadata: {} }, response.status === 503 ? "OCR 服务未就绪，等待管理员重新解析" : `OCR 服务调用失败（HTTP ${response.status}）`);
    const payload = await response.json() as OcrPayload;
    return parseOcrResponse(input.fileName, payload);
  } catch (error) {
    const reason = error instanceof DOMException && error.name === "AbortError" ? "OCR 服务调用超时，等待管理员重新解析" : "OCR 服务不可达，等待管理员重新解析";
    return parseOcrResponse(input.fileName, { text: "", pages: [], tables: [], metadata: {} }, reason);
  } finally { clearTimeout(timer); }
}
