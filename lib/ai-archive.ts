// 本文件实现 AI 写作成果的受控正式化；复用既有 documents/document_versions/审批链，不向公共 RAG 直接写入非正式成果。
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { approvals, auditLogs, documentVersions, documents, formalArtifacts, writingArtifacts, writingDocuments } from "../db/schema";
import type { AccessUser } from "./access";
import { indexDocumentVersion } from "./ingestion";

// 读取私有 Writing Artifact。输入为当前用户与成果 ID；输出只允许创建人或系统管理员取得，其他用户不得跨用户读取。
export async function getWritingArtifactForUser(user: AccessUser, artifactId: string) {
  const [artifact] = await getDb().select().from(writingArtifacts).where(eq(writingArtifacts.id, artifactId)).limit(1);
  if (!artifact) return null;
  if (user.role !== "system_admin" && artifact.ownerUserId !== user.id) return "forbidden" as const;
  return artifact;
}

// 将 NON_FORMAL 成果正式化为待审核资料。输入必须来自系统管理员的显式操作；输出为幂等 Formal Artifact 与既有正式资料版本关联。
export async function formalizeWritingArtifact(user: AccessUser, artifactId: string) {
  if (user.role !== "system_admin") return "forbidden" as const;
  const db = getDb();
  const [artifact] = await db.select().from(writingArtifacts).where(eq(writingArtifacts.id, artifactId)).limit(1);
  if (!artifact) return null;
  const [existing] = await db.select().from(formalArtifacts).where(eq(formalArtifacts.sourceWritingArtifactId, artifact.id)).limit(1);
  if (existing) return { artifact: existing, created: false };
  if (artifact.status !== "NON_FORMAL") return "invalid_status" as const;

  const [writing] = await db.select().from(writingDocuments).where(eq(writingDocuments.id, artifact.writingDocumentId)).limit(1);
  if (!writing) return "invalid_status" as const;

  const now = new Date().toISOString(); const formalId = crypto.randomUUID(); const documentId = crypto.randomUUID(); const versionId = crypto.randomUUID(); const approvalId = crypto.randomUUID(); const auditId = crypto.randomUUID();
  // 正式化只创建 pending_review 正式资料；不会绕过现有 approved/effective/current/reliability 门槛。
  await db.insert(documents).values({
    id: documentId, title: writing.title, documentType: "AI写作正式成果", sourceType: "formal_artifact", sourceRef: formalId,
    ownerDepartment: artifact.ownerDepartment, securityLevel: "内部", permissionScope: "责任部门", lifecycleStatus: "effective", trialDataClass: "T2-内部脱敏测试", isTrialData: true,
    resourceStatus: "pending_review", resourceCategory: "项目资料", reliabilityScore: 0, knowledgeStatus: "pending", currentVersion: 1,
    createdBy: user.name, createdByUserId: user.id, createdAt: now, updatedAt: now,
  });
  await db.insert(documentVersions).values({ id: versionId, documentId, versionNo: 1, content: artifact.content, changeSummary: "由受控 Writing Artifact 正式化提交", versionStatus: "pending", createdBy: user.name, createdAt: now });
  await indexDocumentVersion(documentId, versionId, artifact.content);
  await db.insert(approvals).values({ id: approvalId, documentId, versionId, status: "pending", submittedBy: user.name, submittedAt: now });
  await db.insert(auditLogs).values({ id: auditId, action: "正式化写作成果", entityType: "formal_artifact", entityId: formalId, operator: user.name, detail: `sourceWritingArtifact=${artifact.id}; knowledgeDocument=${documentId}; status=pending_review`, createdAt: now });
  await db.insert(formalArtifacts).values({ id: formalId, sourceWritingArtifactId: artifact.id, ownerUserId: artifact.ownerUserId, ownerDepartment: artifact.ownerDepartment, title: writing.title, status: "pending_review", formalizedByUserId: user.id, formalizedBy: user.name, formalizedAt: now, knowledgeDocumentId: documentId, knowledgeVersionId: versionId, auditLogId: auditId, createdAt: now, updatedAt: now });
  await db.update(writingArtifacts).set({ status: "FORMALIZED", formalizedAt: now, formalizedBy: user.name, updatedAt: now }).where(eq(writingArtifacts.id, artifact.id));
  const [created] = await db.select().from(formalArtifacts).where(eq(formalArtifacts.id, formalId));
  return { artifact: created, created: true };
}
