// 本接口读取单个 Writing Artifact；私有内容必须在服务端再次校验创建人或系统管理员权限。
import { accessError, requireAccessUser } from "../../../../../lib/access";
import { getWritingArtifactForUser } from "../../../../../lib/ai-archive";

export const runtime = "edge";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAccessUser(request); const { id } = await context.params; const artifact = await getWritingArtifactForUser(user, id);
    if (!artifact) return Response.json({ error: "写作成果不存在" }, { status: 404 });
    if (artifact === "forbidden") return Response.json({ error: "无权读取其他用户的写作成果" }, { status: 403 });
    return Response.json({ artifact });
  } catch (error) { return accessError(error, "读取写作成果失败"); }
}
