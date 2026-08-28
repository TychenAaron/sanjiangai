// 验证知识会话侧栏与知识资源批量删除控件的源码约束；不读取真实资料或调用外部服务。
import { readFile } from "node:fs/promises";

async function main() {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const pageMarkers = [
    "knowledge-chat-layout", "conversation-sidebar", "conversation-sidebar-actions", "new-conversation", "conversation-list",
    "deleteConversation", "deleteSelectedConversations", "deleteConversations", "selectedConversationIds", "conversationNotice",
    "全选当前列表", "批量删除", "selectedDocumentIds", "deleteSelectedDocuments", "全选当前页", "isSystemAdmin &&",
  ];
  for (const marker of pageMarkers) if (!page.includes(marker)) throw new Error(`页面缺少控制：${marker}`);
  const cssMarkers = [
    ".knowledge-chat-layout { display: grid", "grid-template-columns: 248px", ".conversation-sidebar { display: flex",
    ".conversation-sidebar-actions", ".conversation-bulk-actions", ".new-conversation", ".conversation-list { display: flex",
    "overflow-y: auto", ".conversation-list > div.active", ".conversation-select", ".conversation-delete",
    ".bulk-document-actions", ".library-row > input",
  ];
  for (const marker of cssMarkers) if (!css.includes(marker)) throw new Error(`样式缺少布局约束：${marker}`);
  console.log("PASS 知识会话侧栏与管理员批量删除 UI 约束存在。");
}

void main();
