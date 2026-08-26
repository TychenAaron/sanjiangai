import { accessError, requireAccessUser } from "../../../../lib/access";
import { modelGatewayStatus } from "../../../../lib/rag";

export const runtime = "edge";

export async function GET(request: Request) {
  try {
    await requireAccessUser(request);
    const gateway = modelGatewayStatus();
    return Response.json({
      gateway,
      services: [
        { name: gateway.model, purpose: "知识问答依据回答", status: gateway.configured ? "已配置，可在引用约束下尝试调用" : "未配置，系统将使用原文摘录模式" },
        { name: "Qwen3-Embedding-4B", purpose: "语义向量检索", status: "下一阶段接入" },
        { name: "Qwen3-Reranker-4B", purpose: "检索结果重排", status: "下一阶段接入" },
        { name: "PaddleOCR-VL", purpose: "PDF和扫描件识别", status: "OCR阶段接入" },
      ],
    });
  } catch (error) { return accessError(error, "读取模型状态失败"); }
}
