import { asc, inArray } from "drizzle-orm";
import { getDb } from "../../../../db";
import { users } from "../../../../db/schema";
import {
  accessError,
  canManageUsers,
  clearLocalTestIdentityCookie,
  createLocalTestIdentityCookie,
  isLocalDevelopmentRequest,
  LOCAL_TEST_ACCOUNTS,
  type LocalTestAccountKey,
  publicUser,
  requireAccessUser,
} from "../../../../lib/access";
import { canReadDocument } from "../../../../lib/document-access";

export const runtime = "edge";

const LOCAL_TEST_EMAILS = Object.values(LOCAL_TEST_ACCOUNTS).map((account) => account.email);

function isLocalTestAccountKey(value: unknown): value is LocalTestAccountKey {
  return typeof value === "string" && Object.hasOwn(LOCAL_TEST_ACCOUNTS, value);
}

// 说明：这个接口仅用于本机开发阶段查看测试账号与资料级别矩阵。
// 输入是管理员在 localhost 下发起的请求，输出是四个虚构测试账号的身份信息和可读级别。
// 它必须同时满足“本地开发环境”和“系统管理员访问”两道限制，不能暴露到正式部署环境。
export async function GET(request: Request) {
  try {
    if (!isLocalDevelopmentRequest(request)) {
      return Response.json({ error: "该测试接口仅允许本机开发环境访问" }, { status: 403 });
    }

    const current = await requireAccessUser(request);
    if (!canManageUsers(current)) {
      return Response.json({ error: "仅系统管理员可查看本机测试账号" }, { status: 403 });
    }

    const db = getDb();
    // 说明：这里只读取四个虚构测试账号，不扫描真实业务员工数据。
    const rows = await db
      .select()
      .from(users)
      .where(inArray(users.email, LOCAL_TEST_EMAILS))
      .orderBy(asc(users.email));

    const levelProbe = [
      { id: "public", ownerDepartment: "试用业务部", securityLevel: "public", permissionScope: "公司全员", lifecycleStatus: "effective", knowledgeStatus: "approved", createdByUserId: null },
      { id: "internal", ownerDepartment: "试用业务部", securityLevel: "internal", permissionScope: "公司全员", lifecycleStatus: "effective", knowledgeStatus: "approved", createdByUserId: null },
      { id: "sensitive", ownerDepartment: "试用业务部", securityLevel: "sensitive", permissionScope: "责任部门", lifecycleStatus: "effective", knowledgeStatus: "approved", createdByUserId: null },
      { id: "confidential", ownerDepartment: "试用业务部", securityLevel: "confidential", permissionScope: "领导班子", lifecycleStatus: "effective", knowledgeStatus: "approved", createdByUserId: null },
    ];

    return Response.json({
      currentIdentity: publicUser(current),
      switchableAccounts: Object.entries(LOCAL_TEST_ACCOUNTS).map(([key, account]) => ({
        key,
        email: account.email,
        name: account.name,
      })),
      users: rows.map((user) => ({
        ...publicUser(user),
        readableLevels: levelProbe.filter((document) => canReadDocument(user, document)).map((document) => document.id),
      })),
    });
  } catch (error) {
    return accessError(error, "读取本机测试账号失败");
  }
}

// 说明：本机管理员身份切换接口。
// 输入是 localhost development 环境中的 action 和固定账号代号，输出是设置或清除 HttpOnly Cookie 的结果。
// switch 必须先验证当前账号是 system_admin；clear 只在本机开发环境清除自己的 Cookie，
// 以便普通员工测试后恢复默认管理员。接口不接受邮箱、URL 参数或自定义认证头作为切换身份。
export async function POST(request: Request) {
  try {
    if (!isLocalDevelopmentRequest(request)) {
      return Response.json({ error: "该测试接口仅允许本机开发环境访问" }, { status: 403 });
    }

    const body = (await request.json()) as { action?: unknown; account?: unknown };
    if (body.action === "clear") {
      return Response.json(
        { restoredAccount: "admin", message: "本机测试身份已清除，下次请求将恢复默认管理员" },
        { headers: { "Set-Cookie": clearLocalTestIdentityCookie() } },
      );
    }

    if (body.action !== "switch" || !isLocalTestAccountKey(body.account)) {
      return Response.json({ error: "仅支持切换到固定的本机测试账号" }, { status: 400 });
    }

    const current = await requireAccessUser(request);
    if (!canManageUsers(current)) {
      return Response.json({ error: "仅系统管理员可切换本机测试身份" }, { status: 403 });
    }

    const target = LOCAL_TEST_ACCOUNTS[body.account];
    const db = getDb();
    // 说明：切换前确认目标账号已存在且启用，实际权限仍由 users 表字段和 document_acl 继续计算。
    const targetUser = await db.query.users.findFirst({
      where: (table, { and, eq }) => and(eq(table.email, target.email), eq(table.status, "active")),
    });
    if (!targetUser) {
      return Response.json({ error: "本机测试账号尚未初始化，请先执行本机测试账号种子命令" }, { status: 409 });
    }

    return Response.json(
      { activeAccount: body.account, user: publicUser(targetUser) },
      { headers: { "Set-Cookie": await createLocalTestIdentityCookie(body.account) } },
    );
  } catch (error) {
    return accessError(error, "切换本机测试身份失败");
  }
}
