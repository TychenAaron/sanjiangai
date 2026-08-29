// 正式知识资源原文件代理：浏览器只访问平台受控接口，服务端复用 ACL 后从私有 R2 流式返回文件。
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { documentAcl, documents } from "../../../../../db/schema";
import { accessError, canReadDocument, requireAccessUser } from "../../../../../lib/access";

export const runtime = "edge";
type BucketObject = { body: ReadableStream; httpMetadata?: { contentType?: string } };
type Bucket = { get: (key: string) => Promise<BucketObject | null> };
function safeFileName(value: string) { return value.replace(/[\\/:*?"<>|\r\n]+/g, "-").slice(0, 160) || "document"; }

// 说明：代理下载或内嵌阅读原文件。输入为文档 ID、下载参数和当前用户；输出是受 ACL 保护的文件流，永不重定向或泄露 R2 地址。
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAccessUser(request); const id = (await context.params).id; const db = getDb();
    const [[document], grants] = await Promise.all([db.select().from(documents).where(eq(documents.id, id)).limit(1), db.select().from(documentAcl)]);
    if (!document) return Response.json({ error: "资料不存在" }, { status: 404 });
    if (!canReadDocument(user, document, grants)) return Response.json({ error: "无权读取该资料" }, { status: 403 });
    if (!document.storageKey || !document.fileName) return Response.json({ error: "该资料未保存原始文件" }, { status: 404 });
    const object = await (env as unknown as { BUCKET?: Bucket }).BUCKET?.get(document.storageKey);
    if (!object) return Response.json({ error: "原始文件暂不可用" }, { status: 404 });
    const download = new URL(request.url).searchParams.get("download") === "1";
    const fileName = safeFileName(document.fileName);
    return new Response(object.body, { headers: { "Content-Type": document.mimeType || object.httpMetadata?.contentType || "application/octet-stream", "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(fileName)}`, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
  } catch (error) { return accessError(error, "读取原始文件失败"); }
}
