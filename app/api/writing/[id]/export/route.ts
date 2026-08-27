import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { auditLogs, writingDocuments, writingVersions } from "../../../../../db/schema";
import { accessError, requireAccessUser } from "../../../../../lib/access";
import { createWritingDocx, createWritingDownloadName, type WritingExportReference } from "../../../../../lib/docx-export";
import { parseStructuredWriting } from "../../../../../lib/writing-structured";

export const runtime = "edge";

// 说明：导出接口只从 URL 取得公文 ID，再由服务端重新读取当前账号、公文和最新正文；创建人可导出本人，系统管理员可导出全部，前端正文和权限参数不会被信任。
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAccessUser(request);
    const { id } = await context.params;
    const db = getDb();
    const [writing] = await db.select().from(writingDocuments).where(eq(writingDocuments.id, id));
    if (!writing) return Response.json({ error: "公文工作区记录不存在" }, { status: 404 });
    if (user.role !== "system_admin" && writing.createdByUserId !== user.id) {
      return Response.json({ error: "当前账号无权导出该公文" }, { status: 403 });
    }

    // 说明：页面不再设置“最终定稿”；仅导出服务器已有的最新生成或人工编辑版本，空工作区仍会被拒绝。
    const versions = await db.select().from(writingVersions)
      .where(eq(writingVersions.writingDocumentId, id))
      .orderBy(desc(writingVersions.versionNo));
    const exportVersion = versions.find((version) => version.stage === "generated" || version.stage === "edited" || version.stage === "draft" || version.stage === "revised" || version.stage === "final");
    if (!exportVersion) return Response.json({ error: "请先生成正文后再导出 Word" }, { status: 409 });

    let references: WritingExportReference[] = [];
    try {
      const parsed = JSON.parse(writing.referencesJson) as unknown;
      if (Array.isArray(parsed)) {
        references = parsed.filter((item): item is WritingExportReference => Boolean(item) && typeof item === "object"
          && typeof (item as WritingExportReference).title === "string"
          && typeof (item as WritingExportReference).version === "number"
          && typeof (item as WritingExportReference).sourceType === "string"
          && typeof (item as WritingExportReference).location === "string");
      }
    } catch {
      // 历史引用字段无法解析时不导出附录，仍保留当前正文；不会用前端数据补造引用。
      references = [];
    }

    // 私有参考材料不在此查询，也不会传入导出模块；附录只来自权限过滤后的正式 citations。
    const structured = parseStructuredWriting(exportVersion.structuredContentJson);
    const bytes = createWritingDocx({ title: writing.title, documentType: writing.documentType, finalContent: exportVersion.content, references, structured });
    const body = new Uint8Array(bytes);
    const now = new Date().toISOString();
    // 说明：审计只记录导出人、公文 ID、当前版本号和引用数量，不保存正文、历史或文件二进制内容。
    await db.insert(auditLogs).values({ id: crypto.randomUUID(), action: "导出公文 Word", entityType: "writing_document", entityId: id, operator: user.name, detail: `V${exportVersion.versionNo}.0｜引用${references.length}条｜仅导出，不审批不入库`, createdAt: now });
    const fileName = createWritingDownloadName(writing.documentType, writing.title);
    return new Response(body, { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="writing-final.docx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    } });
  } catch (error) {
    return accessError(error, "导出 Word 失败");
  }
}
