// 本接口查询 Formal Artifact 与既有正式知识 document/version 的关系；仅成果创建人或系统管理员可读取。
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { approvals, documentVersions, documents, formalArtifacts, writingArtifacts, writingDocuments } from "../../../../db/schema";
import { accessError, requireAccessUser } from "../../../../lib/access";

export const runtime = "edge";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAccessUser(request); const { id } = await context.params;
    const [artifact] = await getDb().select().from(formalArtifacts).where(eq(formalArtifacts.id, id)).limit(1);
    if (!artifact) return Response.json({ error: "正式成果不存在" }, { status: 404 });
    if (user.role !== "system_admin" && artifact.ownerUserId !== user.id) return Response.json({ error: "无权读取该正式成果" }, { status: 403 });
    const db = getDb(); const [source] = await db.select().from(writingArtifacts).where(eq(writingArtifacts.id, artifact.sourceWritingArtifactId)).limit(1);
    const [writingRows, documentRows, versionRows, approvalRows] = await Promise.all([
      source ? db.select().from(writingDocuments).where(eq(writingDocuments.id, source.writingDocumentId)).limit(1) : Promise.resolve([]), db.select().from(documents).where(eq(documents.id, artifact.knowledgeDocumentId)).limit(1), db.select().from(documentVersions).where(eq(documentVersions.id, artifact.knowledgeVersionId)).limit(1), db.select().from(approvals).where(eq(approvals.versionId, artifact.knowledgeVersionId)).orderBy(desc(approvals.submittedAt)).limit(1),
    ]);
    const [writing] = writingRows; const [document] = documentRows; const [version] = versionRows; const [approval] = approvalRows;
    return Response.json({ formalArtifact: artifact, sourceWritingArtifact: source ? { id: source.id, writingDocumentId: source.writingDocumentId, ownerUserId: source.ownerUserId, privateReferenceIdsJson: source.privateReferenceIdsJson, formalEvidenceIdsJson: source.formalEvidenceIdsJson } : null, writingTask: writing ? { id: writing.id, title: writing.title } : null, knowledge: document && version ? { documentId: document.id, versionId: version.id, resourceStatus: document.resourceStatus, lifecycleStatus: document.lifecycleStatus, currentVersion: document.currentVersion, versionNo: version.versionNo, versionStatus: version.versionStatus, reliabilityScore: document.reliabilityScore, securityLevel: document.securityLevel, permissionScope: document.permissionScope, parseStatus: document.parseStatus, indexStatus: document.indexStatus, approvalStatus: approval?.status || "none", approvedBy: approval?.reviewer || null, approvedAt: approval?.reviewedAt || null, reviewNote: document.reviewNote } : null });
  } catch (error) { return accessError(error, "读取正式成果失败"); }
}
