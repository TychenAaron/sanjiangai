// 在本机服务上验证管理员逐项批量删除的生命周期效果；只创建并清理完全虚构的资料。
const baseUrl = process.env.LOCAL_TEST_BASE_URL || "http://localhost:5173";

function expect(actual: boolean, message: string) { if (!actual) throw new Error(message); console.log(`PASS ${message}`); }

/** 创建虚构待审核资料，模拟一项成功和一项失败的批量删除，确认成功项不会回滚。 */
async function main() {
  const create = async (title: string) => {
    const response = await fetch(`${baseUrl}/api/documents`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, content: `完全虚构的${title}正文。`, documentType: "其他资料", trialDataClass: "T2-内部脱敏测试", securityLevel: "D2", permissionScope: "责任部门", resourceCategory: "其他", confirmedDesensitized: true, submitMode: "pending" }) });
    expect(response.status === 201, "管理员可创建虚构待审核资料"); return (await response.json() as { document: { id: string } }).document.id;
  };
  const documentId = await create("VERIFY_BULK_DELETE_DOCUMENT");
  const deleted = await fetch(`${baseUrl}/api/documents/${documentId}/lifecycle`, { method: "DELETE" }); expect(deleted.ok, "第一项删除成功并执行生命周期清理");
  const failed = await fetch(`${baseUrl}/api/documents/not-a-real-document/lifecycle`, { method: "DELETE" }); expect(failed.status === 404, "第二项失败被独立返回");
  const documents = await fetch(`${baseUrl}/api/documents`); const payload = await documents.json() as { documents: Array<{ id: string }> };
  expect(!payload.documents.some((document) => document.id === documentId), "成功删除项未因后续失败回滚，且不再出现在资料列表");

  const protectedId = await create("VERIFY_BULK_DELETE_PERMISSION");
  const switchResponse = await fetch(`${baseUrl}/api/local-test/accounts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "switch", account: "staff" }) });
  const staffCookie = switchResponse.headers.get("set-cookie")?.split(";")[0];
  const denied = await fetch(`${baseUrl}/api/documents/${protectedId}/lifecycle`, { method: "DELETE", headers: staffCookie ? { cookie: staffCookie } : {} });
  expect(denied.status === 403, "普通员工不能删除真实正式资料");
  await fetch(`${baseUrl}/api/local-test/accounts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "clear" }) });
  const cleanup = await fetch(`${baseUrl}/api/documents/${protectedId}/lifecycle`, { method: "DELETE" }); expect(cleanup.ok, "管理员清理权限验证资料");
}
void main();
