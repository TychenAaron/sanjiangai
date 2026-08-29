// 本脚本用静态虚构断言验证会话持久化、正式资料过滤和历史失效保护，不访问服务、D1、R2 或模型。
import { readFile } from "node:fs/promises";
import { callModelGateway, readModelGatewayConfig } from "../lib/model-gateway.ts";
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const [schema, conversations, ask, search, rag] = await Promise.all([
  readFile(new URL("../db/schema.ts", import.meta.url), "utf8"), readFile(new URL("../lib/knowledge-conversations.ts", import.meta.url), "utf8"), readFile(new URL("../app/api/knowledge/ask/route.ts", import.meta.url), "utf8"), readFile(new URL("../app/api/knowledge/search/route.ts", import.meta.url), "utf8"), readFile(new URL("../lib/rag.ts", import.meta.url), "utf8"),
]);
assert(schema.includes("knowledgeConversations") && schema.includes("knowledgeMessages") && schema.includes("knowledgeMessageCitations"), "会话、消息或引用快照表缺失");
assert(conversations.includes("createdByUserId !== user.id") && conversations.includes("deletedAt") && conversations.includes("该历史回答关联资料已失效或当前无权查看。"), "会话归属、软删除或历史失效保护缺失");
assert(ask.includes("saveConversationExchange") && search.includes("saveConversationExchange"), "问答和资料检索均应写入会话");
assert(ask.includes("getValidConversationContext") && ask.includes("answerKnowledge(user, query, history)"), "智能问答必须把有效会话上下文交给既有模型链路");
assert(!search.includes("callModelGateway") && !search.includes("answerKnowledge"), "资料检索不得调用模型");
assert(rag.includes('eq(documents.parseStatus, "parsed")') && rag.includes('eq(documents.indexStatus, "ready")') && !rag.includes('gte(documents.reliabilityScore, 60)') && rag.includes('ne(documents.securityLevel, "D4")'), "两种模式必须共用正式资料过滤且不以评分阻断");
const config = readModelGatewayConfig({ MODEL_GATEWAY_BASE_URL: "https://model.example.invalid/v1", MODEL_GATEWAY_API_KEY: "virtual-key", MODEL_GATEWAY_MODEL: "virtual-model" });
let called = false;
const gatewayResult = await callModelGateway(config, "虚构问题", [{ title: "虚构正式资料", version: 1, sourceType: "manual", location: "第1段", excerpt: "虚构正式依据" }], async () => { called = true; return Response.json({ choices: [{ message: { content: "虚构回答[1]" } }] }); }, [{ role: "assistant", content: "仅此有效历史回答" }]);
assert(called && gatewayResult.status === "success", "智能问答必须复用现有 OpenAI-compatible 模型网关模拟调用");
console.log("PASS 知识会话持久化、归属权限、历史失效保护和正式资料过滤均已覆盖（全为虚构断言）。");
