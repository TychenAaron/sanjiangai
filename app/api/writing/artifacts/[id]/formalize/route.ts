// 本接口由系统管理员显式触发正式化；它只创建待审核正式资料，不能直接使成果进入 RAG。
import { accessError, requireAccessUser } from "../../../../../../lib/access";
import { formalizeWritingArtifact } from "../../../../../../lib/ai-archive";

export const runtime = "edge";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAccessUser(request); const { id } = await context.params; const result = await formalizeWritingArtifact(user, id);
    if (!result) return Response.json({ error: "写作成果不存在" }, { status: 404 });
    if (result === "forbidden") return Response.json({ error: "仅系统管理员可正式化写作成果" }, { status: 403 });
    if (result === "invalid_status") return Response.json({ error: "该写作成果当前不能正式化" }, { status: 409 });
    return Response.json({ formalArtifact: result.artifact, created: result.created }, { status: result.created ? 201 : 200 });
  } catch (error) { return accessError(error, "正式化写作成果失败"); }
}
