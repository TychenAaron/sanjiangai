// 验证知识会话列表布局与知识资源批量删除控制的源码约束；不读取真实资料或调用外部服务。
import { readFile } from "node:fs/promises";

async function main() {
  const [page, css] = await Promise.all([readFile(new URL("../app/page.tsx", import.meta.url), "utf8"), readFile(new URL("../app/globals.css", import.meta.url), "utf8")]);
  for (const marker of ["conversation-list", "deleteConversation", "selectedDocumentIds", "deleteSelectedDocuments", "全选当前页", "批量删除", "isSystemAdmin &&"]) if (!page.includes(marker)) throw new Error(`页面缺少控制：${marker}`);
  for (const marker of [".conversation-list { display: flex", "max-height: 330px", "overflow-y: auto", ".conversation-list > div.active", ".bulk-document-actions", ".library-row > input"]) if (!css.includes(marker)) throw new Error(`样式缺少布局约束：${marker}`);
  console.log("PASS 知识会话列表与管理员批量删除 UI 约束存在。");
}
void main();
