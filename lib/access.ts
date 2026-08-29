import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { departments, users } from "../db/schema";
import {
  canEditDocument,
  canManageFormalDocuments,
  canUploadDocument,
  canReadDocument,
  canReviewDocument,
  type AccessDocument,
  type AccessGrant,
} from "./document-access";

export { canEditDocument, canManageFormalDocuments, canReadDocument, canReviewDocument, canUploadDocument };
export type { AccessDocument, AccessGrant };

export type AccessUser = typeof users.$inferSelect;
export const LOCAL_TEST_ACCOUNTS = {
  admin: { email: "local.admin@sanjiang.test", name: "本地测试管理员" },
  staff: { email: "local.staff@sanjiang.test", name: "本地测试员工" },
  manager: { email: "local.manager@sanjiang.test", name: "本地测试部门负责人" },
  finance: { email: "local.finance@sanjiang.test", name: "本地测试财务负责人" },
} as const;
export type LocalTestAccountKey = keyof typeof LOCAL_TEST_ACCOUNTS;

const LOCAL_DEV_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const LOCAL_TEST_IDENTITY_COOKIE = "sj_local_test_identity";
const LOCAL_TEST_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 8;
const localCookieSecret = crypto.getRandomValues(new Uint8Array(32));

function decodeName(request: Request) {
  const encoded = request.headers.get("oai-authenticated-user-full-name");
  const encoding = request.headers.get("oai-authenticated-user-full-name-encoding");
  if (!encoded || encoding !== "percent-encoded-utf-8") return null;
  try { return decodeURIComponent(encoded); } catch { return null; }
}

// 说明：判断请求是否来自允许使用本机测试工具的开发环境。
// 输入是当前请求，输出是是否同时满足 development 与 localhost 双重限制。
// 生产环境、局域网 IP 和线上域名都会返回 false，不能启用本机测试身份或测试接口。
export function isLocalDevelopmentRequest(request: Request) {
  if (process.env.NODE_ENV !== "development") return false;
  let hostName: string;
  try {
    hostName = new URL(request.url).hostname.toLowerCase();
  } catch {
    return false;
  }

  return LOCAL_DEV_HOSTS.has(hostName);
}

function toHex(value: ArrayBuffer) {
  return [...new Uint8Array(value)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// 说明：为本机测试身份 Cookie 生成服务端签名。
// 输入是白名单账号代号和过期时间，输出是不可由浏览器任意伪造的签名字符串。
// 签名密钥只存在于 development Worker 内存中，重启开发服务后旧 Cookie 会自动失效。
async function signLocalTestIdentity(account: LocalTestAccountKey, expiresAt: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    localCookieSecret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const payload = new TextEncoder().encode(`${account}:${expiresAt}`);
  return toHex(await crypto.subtle.sign("HMAC", key, payload));
}

function getCookie(request: Request, name: string) {
  const value = request.headers.get("cookie");
  if (!value) return null;
  return value
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) ?? null;
}

function isLocalTestAccountKey(value: string): value is LocalTestAccountKey {
  return Object.hasOwn(LOCAL_TEST_ACCOUNTS, value);
}

// 说明：读取并验证本机测试身份 Cookie。
// 输入是 localhost development 请求，输出是白名单测试账号或 null。
// Cookie 只有签名、有效期和账号白名单均通过时才有效，不能靠 URL、请求头或前端邮箱直接伪造身份。
async function getCookieLocalIdentity(request: Request) {
  const cookie = getCookie(request, LOCAL_TEST_IDENTITY_COOKIE);
  if (!cookie) return null;

  const [account, expiresAtText, signature] = cookie.split(":");
  const expiresAt = Number(expiresAtText);
  if (!account || !signature || !Number.isSafeInteger(expiresAt) || Date.now() >= expiresAt) {
    return null;
  }
  if (!isLocalTestAccountKey(account)) return null;

  const expectedSignature = await signLocalTestIdentity(account, expiresAt);
  if (signature !== expectedSignature) return null;
  return LOCAL_TEST_ACCOUNTS[account];
}

// 说明：创建由管理员签发的本机测试身份 Cookie。
// 输入是固定白名单账号代号，输出是 HttpOnly Cookie 响应头值。
// 该 Cookie 仅能在 localhost development 请求中被认证入口使用，对生产部署没有影响。
export async function createLocalTestIdentityCookie(account: LocalTestAccountKey) {
  const expiresAt = Date.now() + LOCAL_TEST_COOKIE_MAX_AGE_SECONDS * 1000;
  const signature = await signLocalTestIdentity(account, expiresAt);
  return `${LOCAL_TEST_IDENTITY_COOKIE}=${account}:${expiresAt}:${signature}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${LOCAL_TEST_COOKIE_MAX_AGE_SECONDS}`;
}

// 说明：清除浏览器当前的本机测试身份 Cookie。
// 输入为空，输出是立即过期的 Cookie 响应头值；下一个 localhost development 请求会回退到默认管理员。
export function clearLocalTestIdentityCookie() {
  return `${LOCAL_TEST_IDENTITY_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

// 说明：统一认证入口中的本地身份回退。
// 正式认证头始终优先；没有正式身份时，才会在 development + localhost 下使用已签名 Cookie，
// Cookie 缺失或失效则回退到默认本机管理员。此逻辑不能在生产环境生效。
async function getLocalDevelopmentIdentity(request: Request) {
  if (!isLocalDevelopmentRequest(request)) return null;
  return (await getCookieLocalIdentity(request)) ?? LOCAL_TEST_ACCOUNTS.admin;
}

export async function requireAccessUser(request: Request): Promise<AccessUser> {
  // 说明：身份选择顺序是“正式请求头优先，本地开发身份回退在后”。
  // 只有正式认证邮箱不存在时，才允许在 development + localhost 条件下补一个虚构测试身份。
  const headerEmail = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  const localIdentity = headerEmail ? null : await getLocalDevelopmentIdentity(request);
  const email = headerEmail ?? localIdentity?.email ?? null;
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
    id: userId, name: decodeName(request) || localIdentity?.name || email.split("@")[0], email, departmentId, departmentName: "试用管理组",
    role: "system_admin", positionLevel: 5, clearanceLevel: 3, status: "active", createdAt: now,
  });
  const created = await db.query.users.findFirst({ where: (table, { eq }) => eq(table.id, userId) });
  if (!created) throw new AccessError(500, "初始化试用管理员失败");
  return created;
}

export function canManageUsers(user: AccessUser) { return user.role === "system_admin"; }
export function canManageUploadRules(user: AccessUser) { return user.role === "system_admin" || user.role === "knowledge_admin"; }
export function canReadAudit(user: AccessUser) {
  return new Set(["reviewer", "knowledge_admin", "system_admin"]).has(user.role);
}

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
