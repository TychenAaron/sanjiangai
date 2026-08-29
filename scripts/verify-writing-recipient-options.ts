// 验证报送/发送对象下拉的持久化、权限与历史兼容边界；只读取源码和迁移，不连接模型或线上服务。
import { readFile } from "node:fs/promises";
import { strict as assert } from "node:assert";

async function source(path: string) { return readFile(new URL(`../${path}`, import.meta.url), "utf8"); }

// 说明：检查新任务必须选启用数据库项、管理员才可维护、已使用选项不可删除。输出为离线断言结果，不读写 D1 或业务资料。
async function main() {
  const [migration, schema, writingApi, listApi, itemApi, page] = await Promise.all([
    source("drizzle/0016_writing_recipient_options.sql"), source("db/schema.ts"), source("app/api/writing/route.ts"),
    source("app/api/writing/recipient-options/route.ts"), source("app/api/writing/recipient-options/[id]/route.ts"), source("app/page.tsx"),
  ]);
  assert.match(migration, /CREATE TABLE writing_recipient_options/);
  assert.match(migration, /recipient_option_id/);
  assert.match(schema, /writingRecipientOptions/);
  assert.match(schema, /recipientOptionId/);
  assert.match(writingApi, /resolveEnabledRecipientOption/);
  assert.match(writingApi, /请选择启用的报送\/发送对象/);
  assert.match(writingApi, /recipientOptionId: recipientOption\.id/);
  assert.match(listApi, /user\.role === "system_admin"/);
  assert.match(listApi, /eq\(writingRecipientOptions\.enabled, true\)/);
  assert.match(itemApi, /writingDocuments\.recipientOptionId/);
  assert.match(itemApi, /请停用而不是删除/);
  assert.match(page, /<select value=\{form\.recipientOptionId\}/);
  assert.match(page, /WritingRecipientOptionsAdmin/);
  assert.doesNotMatch(page, /报送\/发送对象<\/span><input value=\{form\.recipient\}/);
  console.log("verify:writing-recipient-options PASS");
}

void main().catch((error) => { console.error("verify:writing-recipient-options FAIL", error); process.exitCode = 1; });
