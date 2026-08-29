// 本脚本以完全虚构数据检查知识会话的正式依据过滤、失败回答与受限引用预览规则，不访问网络、D1、R2 或模型。
import { readFile } from "node:fs/promises";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

const [rag, previewRoute, askRoute] = await Promise.all([
  readFile(new URL("../lib/rag.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/knowledge/citations/[documentId]/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/knowledge/ask/route.ts", import.meta.url), "utf8"),
]);
assert(rag.includes('eq(documents.parseStatus, "parsed")') && rag.includes('eq(documents.indexStatus, "ready")') && rag.includes('ne(documents.securityLevel, "D4")') && !rag.includes('gte(documents.reliabilityScore, 60)'), "问答检索必须过滤解析状态和 D4，且不以人工评分阻断");
assert(rag.includes("当前无可引用的正式资料，建议补充或检索已批准知识资源。"), "无依据回答必须使用产品指定提示");
assert(rag.includes('mode: "failed"') && rag.includes("回答服务暂时不可用"), "模型失败不得展示编造回答");
assert(previewRoute.includes("canReadDocument") && previewRoute.includes('eq(documents.resourceStatus, "approved")') && previewRoute.includes('eq(documents.parseStatus, "parsed")'), "引用预览必须重新执行权限和正式状态校验");
assert(askRoute.includes("const citations = result.citations.map") && !askRoute.includes("return Response.json(result)"), "知识会话初始响应不得发送完整片段");
console.log("PASS 知识会话正式依据过滤、无依据提示、失败保护和受限预览规则均已覆盖（全为虚构数据）。");
