import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { departments, users } from "../db/schema";

export type AccessUser = typeof users.$inferSelect;
export type AccessDocument = {
  id: string; ownerDepartment: string; securityLevel: string; permissionScope: string;
  lifecycleStatus: string; knowledgeStatus: string; createdByUserId: string | null;
};
export type AccessGrant = { documentId: string; subjectType: string; subjectId: string; canRead: boolean; canEdit: boolean; canReview: boolean };

const rank: Record<string, number> = { "公开": 1, "内部": 2, "敏感": 3, "机密": 4 };
const reviewRoles = new Set(["reviewer", "knowledge_admin", "system_admin"]);

function decodeName(request: Request) {
  const encoded = request.headers.get("oai-authenticated-user-full-name");
  const encoding = request.headers.get("oai-authenticated-user-full-name-encoding");
  if (!encoded || encoding !== "percent-encoded-utf-8") return null;
  try { return decodeURIComponent(encoded); } catch { return null; }
}

export async function requireAccessUser(request: Request): Promise<AccessUser> {
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (!email) throw new AccessError(401, "请先使用已配置的员工账号登录");
  const db = getDb();
  const existing = await db.query.users.findFirst({ where: (table, { eq }) => eq(table.email, email) });
  if (existing) {
    if (existing.status !== "active") throw new AccessError(403, "该账号已停用，请联系系统管理员");
    return existing;
  }

  const [count] = await db.select({ value: sql<number>`count(*)` }).from(users);
  if ((count?.value ?? 0) > 0) throw new AccessError(403, "账号尚未配置员工级别和数据权限，请联系系统管理员");

  const now = new Date().toISOString();
  const departmentId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  await db.insert(departments).values({ id: departmentId, name: "试用管理组", status: "active", createdAt: now });
  await db.insert(users).values({
    id: userId, name: decodeName(request) || email.split("@")[0], email, departmentId, departmentName: "试用管理组",
    role: "system_admin", positionLevel: 5, clearanceLevel: 3, status: "active", createdAt: now,
  });
  const created = await db.query.users.findFirst({ where: (table, { eq }) => eq(table.id, userId) });
  if (!created) throw new AccessError(500, "初始化试用管理员失败");
  return created;
}

export function canReadDocument(user: AccessUser, document: AccessDocument, grants: AccessGrant[] = []) {
  if ((rank[document.securityLevel] ?? 4) > user.clearanceLevel) return false;
  const direct = grants.find(grant => grant.documentId === document.id && grant.subjectType === "user" && grant.subjectId === user.id);
  const scopeAllowed = document.securityLevel === "公开" || document.permissionScope === "集团全员" || document.permissionScope === "公司全员"
    || (document.permissionScope === "集团本部" && (user.positionLevel >= 4 || user.departmentName !== "所属子公司"))
    || ((document.permissionScope === "责任部门" || document.permissionScope === "本部门") && (document.ownerDepartment === user.departmentName || user.positionLevel >= 4))
    || (document.permissionScope === "领导班子" && user.positionLevel >= 4)
    || (document.permissionScope === "指定人员" && Boolean(direct?.canRead));
  if (!scopeAllowed) return false;
  if (document.lifecycleStatus !== "effective" && document.createdByUserId !== user.id && user.role !== "knowledge_admin") return false;
  if (document.knowledgeStatus !== "approved" && document.createdByUserId !== user.id && !reviewRoles.has(user.role)) return false;
  return true;
}

export function canEditDocument(user: AccessUser, document: AccessDocument, grants: AccessGrant[] = []) {
  const direct = grants.find(grant => grant.documentId === document.id && grant.subjectType === "user" && grant.subjectId === user.id);
  return canReadDocument(user, document, grants) && (document.createdByUserId === user.id || user.role === "knowledge_admin" || Boolean(direct?.canEdit));
}

export function canReviewDocument(user: AccessUser, document: AccessDocument, grants: AccessGrant[] = []) {
  const direct = grants.find(grant => grant.documentId === document.id && grant.subjectType === "user" && grant.subjectId === user.id);
  return canReadDocument(user, document, grants) && (reviewRoles.has(user.role) || Boolean(direct?.canReview));
}

export function canManageUsers(user: AccessUser) { return user.role === "system_admin"; }
export function canManageUploadRules(user: AccessUser) { return user.role === "system_admin" || user.role === "knowledge_admin"; }
export function canReadAudit(user: AccessUser) { return reviewRoles.has(user.role); }

export class AccessError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function accessError(error: unknown, fallback: string) {
  if (error instanceof AccessError) return Response.json({ error: error.message }, { status: error.status });
  return Response.json({ error: error instanceof Error ? error.message : fallback }, { status: 500 });
}

export function publicUser(user: AccessUser) {
  return { id: user.id, name: user.name, email: user.email, employeeNo: user.employeeNo, departmentName: user.departmentName,
    role: user.role, positionLevel: user.positionLevel, clearanceLevel: user.clearanceLevel, status: user.status };
}
