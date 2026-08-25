import { accessError, requireAccessUser } from "../../../../lib/access";
import { modelGatewayStatus } from "../../../../lib/rag";

export const runtime = "edge";

export async function GET(request: Request) {
  try {
    await requireAccessUser(request);
    return Response.json({
      gateway: modelGatewayStatus(),
      services: [
        { name: "Qwen3.8-27B", purpose: "知识问答、公文写作、政策解读", status: modelGatewayStatus().configured ? "已连接" : "等待云端地址" },
        { name: "Qwen3-Embedding-4B", purpose: "语义向量检索", status: "下一阶段接入" },
        { name: "Qwen3-Reranker-4B", purpose: "检索结果重排", status: "下一阶段接入" },
        { name: "PaddleOCR-VL", purpose: "PDF和扫描件识别", status: "OCR阶段接入" },
      ],
    });
  } catch (error) { return accessError(error, "读取模型状态失败"); }
}
