// 本脚本用完全虚构制度片段验证中文术语归一化，不访问 D1、R2、模型或真实资料。
import { expandChineseRetrievalPhrases } from "../lib/chinese-query-expansion.ts";

function assert(condition: unknown, message: string) { if (!condition) throw new Error(message); }

/** 验证同义制度表达能被扩展为稳定检索短语，避免原问题未原样出现时直接拒答。 */
function mustContain(query: string, expected: string) {
  assert(expandChineseRetrievalPhrases(query).includes(expected), `问题“${query}”未扩展出“${expected}”`);
}

mustContain("上下班时间是什么时间", "正常班");
mustContain("考勤方式有什么规定", "人脸识别");
mustContain("出差有哪些要求", "差旅");
console.log("PASS 中文制度术语归一化：作息、考勤和差旅问题均可扩展为通用检索短语（全为虚构断言）。");
