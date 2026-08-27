import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { writingDocuments, writingPrivateReferences, writingVersions } from "../../../../db/schema";
import { accessError, requireAccessUser } from "../../../../lib/access";
import { summarizePrivateReferences } from "../../../../lib/writing";

// 说明：读取单份公文工作区、历史版本和私有参考材料；创建人只能查看自己的草稿，系统管理员可查看全部。
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAccessUser(request);
    const { id } = await context.params;
    const db = getDb();
    const [writing] = await db.select().from(writingDocuments).where(eq(writingDocuments.id, id));
    if (!writing) return Response.json({ error: "公文草稿不存在" }, { status: 404 });
    if (user.role !== "system_admin" && writing.createdByUserId !== user.id) {
      return Response.json({ error: "无权查看该公文草稿" }, { status: 403 });
    }

    const versions = await db.select().from(writingVersions).where(eq(writingVersions.writingDocumentId, id)).orderBy(desc(writingVersions.versionNo));
    const privateRows = await db.select().from(writingPrivateReferences).where(eq(writingPrivateReferences.writingDocumentId, id)).orderBy(desc(writingPrivateReferences.updatedAt));
    const privateReferences = summarizePrivateReferences(privateRows.map((row) => ({
      id: row.id,
      fileName: row.fileName,
      parseStatus: row.parseStatus as "parsed" | "pending_conversion" | "pending_ocr" | "failed",
      parseFormat: row.parseFormat,
      parseReason: row.parseReason,
      parsedText: row.parsedText,
      locationsJson: row.locationsJson,
    })));

    return Response.json({ writing, versions, privateReferences });
  } catch (error) {
    return accessError(error, "读取公文版本失败");
  }
}
