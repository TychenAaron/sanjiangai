// 本脚本仅通过本机 HTTP 接口创建和清理虚构会话，验证会话归属删除、跨用户拒绝与逐项删除失败隔离。
const baseUrl = process.env.LOCAL_TEST_BASE_URL || "http://localhost:5173";

function expect(actual: boolean, message: string) {
  if (!actual) throw new Error(message);
  console.log(`PASS ${message}`);
}

async function readPayload(response: Response) {
  return await response.json() as { error?: string; conversation?: { id: string }; conversations?: Array<{ id: string }> };
}

/** 创建当前测试账号所属的虚构会话，返回服务端生成的会话 ID。 */
async function createConversation(title: string, cookie = "") {
  const response = await fetch(`${baseUrl}/api/knowledge/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ title }),
  });
  const payload = await readPayload(response);
  expect(response.status === 201 && Boolean(payload.conversation?.id), `创建虚构会话 ${title}`);
  return payload.conversation!.id;
}

/** 切换本机虚构账号，仅用于验证创建人与他人的会话删除边界。 */
async function switchAccount(account: "staff") {
  const response = await fetch(`${baseUrl}/api/local-test/accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "switch", account }),
  });
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0] || "";
  expect(response.ok && Boolean(cookie), "切换至虚构普通员工账号");
  return cookie;
}

/** 按前端批量删除的逐条调用方式执行，验证中间失败不会阻断后续成功项。 */
async function main() {
  const adminConversation = await createConversation("VERIFY_DELETE_ADMIN_PRIVATE");
  const staffCookie = await switchAccount("staff");
  const denied = await fetch(`${baseUrl}/api/knowledge/conversations/${adminConversation}`, { method: "DELETE", headers: { cookie: staffCookie } });
  expect(denied.status === 403, "普通员工不能删除他人会话");

  const first = await createConversation("VERIFY_DELETE_STAFF_FIRST", staffCookie);
  const second = await createConversation("VERIFY_DELETE_STAFF_SECOND", staffCookie);
  const adminCleanup = await createConversation("VERIFY_DELETE_STAFF_ADMIN_CLEANUP", staffCookie);
  const firstDeleted = await fetch(`${baseUrl}/api/knowledge/conversations/${first}`, { method: "DELETE", headers: { cookie: staffCookie } });
  expect(firstDeleted.ok, "单条会话删除成功");
  const failed = await fetch(`${baseUrl}/api/knowledge/conversations/not-a-real-conversation`, { method: "DELETE", headers: { cookie: staffCookie } });
  expect(failed.status === 403, "无效会话单项失败被明确拒绝");
  const secondDeleted = await fetch(`${baseUrl}/api/knowledge/conversations/${second}`, { method: "DELETE", headers: { cookie: staffCookie } });
  expect(secondDeleted.ok, "批量中前一项失败不影响后续会话删除");
  const staffList = await fetch(`${baseUrl}/api/knowledge/conversations`, { headers: { cookie: staffCookie } });
  const staffPayload = await readPayload(staffList);
  expect(!staffPayload.conversations?.some((item) => item.id === first || item.id === second), "软删除会话不再出现于创建人列表");

  const adminCleanupDeleted = await fetch(`${baseUrl}/api/knowledge/conversations/${adminCleanup}`, { method: "DELETE" });
  expect(adminCleanupDeleted.ok, "系统管理员可清理其他账号的历史测试会话");

  const adminDeleted = await fetch(`${baseUrl}/api/knowledge/conversations/${adminConversation}`, { method: "DELETE" });
  expect(adminDeleted.ok, "创建人可清理自己的虚构会话");
}

void main();
