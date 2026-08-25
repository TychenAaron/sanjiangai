import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLogs, users } from "../../../db/schema";
import { accessError, canManageUsers, publicUser, requireAccessUser } from "../../../lib/access";

export const runtime = "edge";

export async function GET(request: Request) {
  try {
    const current = await requireAccessUser(request);
    if (!canManageUsers(current)) return Response.json({ error: "仅系统管理员可管理员工账号" }, { status: 403 });
    const db = getDb();
    const rows = await db.select().from(users).orderBy(desc(users.createdAt)).limit(100);
    return Response.json({ users: rows.map(publicUser) });
  } catch (error) { return accessError(error, "读取员工账号失败"); }
}

export async function POST(request: Request) {
  try {
    const current = await requireAccessUser(request);
    if (!canManageUsers(current)) return Response.json({ error: "仅系统管理员可配置员工账号" }, { status: 403 });
    const body = (await request.json()) as Record<string, string | number>;
    const email = String(body.email || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    if (!email || !name || !email.includes("@")) return Response.json({ error: "请填写有效的员工姓名和登录邮箱" }, { status: 400 });
    const role = String(body.role || "employee");
    const allowedRoles = new Set(["employee", "department_head", "group_leader", "reviewer", "knowledge_admin", "system_admin"]);
    if (!allowedRoles.has(role)) return Response.json({ error: "账号角色不合法" }, { status: 400 });
    const clearanceLevel = Math.max(1, Math.min(3, Number(body.clearanceLevel) || 1));
    const positionLevel = Math.max(1, Math.min(5, Number(body.positionLevel) || 1));
    const now = new Date().toISOString();
    const db = getDb();
    const id = crypto.randomUUID();
    await db.insert(users).values({ id, name, email, employeeNo: String(body.employeeNo || "") || null, departmentName: String(body.departmentName || "集团办公室"), role, positionLevel, clearanceLevel, status: "active", createdAt: now });
    await db.insert(auditLogs).values({ id: crypto.randomUUID(), action: "配置员工账号", entityType: "user", entityId: id, operator: current.name,
      detail: `${name}｜${email}｜${String(body.departmentName || "集团办公室")}｜P${positionLevel}｜D${clearanceLevel}`, createdAt: now });
    return Response.json({ user: { id, name, email } }, { status: 201 });
  } catch (error) { return accessError(error, "配置员工账号失败"); }
}
