// 本文件集中处理公文写作所需的授权引用、私有参考材料摘要、无模型提纲生成和基础人工检查；不会自动审批、发文或写入正式知识库。
import type { AccessUser } from "./access";
import { retrieveAuthorized, type KnowledgeCitation } from "./rag";

export type WritingType = "请示" | "通知" | "工作情况汇报";
export const WRITING_TYPES = new Set<WritingType>(["请示", "通知", "工作情况汇报"]);

export type WritingPrivateReferenceSummary = {
  id: string;
  fileName: string;
  parseStatus: "parsed" | "pending_conversion" | "pending_ocr" | "failed";
  parseFormat: string;
  parseReason?: string | null;
  excerpt: string;
  locations: string[];
};

// 说明：仅检索当前账号有权、已审核且达到可靠门槛的正式资料，输出可用于公文写作展示的有限引用信息。
export async function resolveWritingReferences(user: AccessUser, query: string) {
  const matches = await retrieveAuthorized(user, query);
  return matches
    // 写作模型和 Word 引用均不允许使用 D4 级资料，即使当前账号对该资料有读取权限也必须在此边界排除。
    .filter((row) => row.document.securityLevel !== "D4")
    .map((row): KnowledgeCitation => ({
    documentId: row.document.id,
    title: row.document.title,
    version: row.versionNo,
    excerpt: row.chunk.content.slice(0, 520),
    sourceType: row.document.sourceType,
    chunkIndex: row.chunk.chunkIndex,
    location: `第${row.chunk.chunkIndex + 1}段`,
    score: Number(row.score.toFixed(1)),
    }));
}

// 说明：把当前工作区私有参考材料的数据库记录整理成页面和提纲都能复用的摘要结构，不读取正式知识库。
export function summarizePrivateReferences(rows: Array<{
  id: string;
  fileName: string;
  parseStatus: WritingPrivateReferenceSummary["parseStatus"];
  parseFormat: string;
  parseReason: string | null;
  parsedText: string;
  locationsJson: string;
}>): WritingPrivateReferenceSummary[] {
  return rows.map((row) => {
    let locations: string[] = [];
    try {
      const parsed = JSON.parse(row.locationsJson) as unknown;
      if (Array.isArray(parsed)) {
        locations = parsed.filter((item): item is string => typeof item === "string");
      }
    } catch {
      locations = [];
    }

    return {
      id: row.id,
      fileName: row.fileName,
      parseStatus: row.parseStatus,
      parseFormat: row.parseFormat,
      parseReason: row.parseReason,
      excerpt: row.parsedText.slice(0, 220),
      locations,
    };
  });
}

// 说明：按文种、已确认事实、正式知识库授权引用和私有参考材料生成待人工确认提纲；缺信息时明确标记“待确认”，不虚构事实。
export function buildOutline(
  type: WritingType,
  title: string,
  recipient: string,
  facts: string,
  references: KnowledgeCitation[],
  privateReferences: WritingPrivateReferenceSummary[] = [],
) {
  const referenceLines = references.length
    ? references.map((item, index) => `${index + 1}. [${index + 1}]《${item.title}》V${item.version}.0 ${item.location}`).join("\n")
    : "- 暂无可引用依据，待补充";
  const privateReferenceLines = privateReferences.length
    ? privateReferences.map((item, index) => `${index + 1}. ${item.fileName}｜${item.parseStatus}${item.locations[0] ? `｜${item.locations[0]}` : ""}${item.excerpt ? `\n   摘要：${item.excerpt}` : ""}${item.parseReason ? `\n   提示：${item.parseReason}` : ""}`).join("\n")
    : "- 暂无私有参考材料";
  const body = type === "请示"
    ? "一、请示事项\n二、事实与依据\n三、拟请示意见"
    : type === "通知"
      ? "一、通知事项\n二、工作要求\n三、时间安排与联系人"
      : "一、工作进展\n二、存在问题\n三、下一步安排";

  return `《${type}提纲（人工待确认）》
标题：${title || "待确认"}
对象：${recipient || "待确认"}

${body}

已填写事实：
${facts || "待确认：请补充事实、日期、金额、人员和对象。"}

引用依据：
${referenceLines}

私有参考材料：
${privateReferenceLines}

提示：本提纲不是正式文件，所有日期、金额、人员、政策表述均须人工核对。`;
}

// 说明：检查人工输入的基础完整性；输入为标题、对象、事实和正文，输出仅作为辅助提示，不替代人工审核。
export function checkWriting(title: string, recipient: string, facts: string, content: string) {
  const checks: string[] = [];
  if (!title.trim()) checks.push("缺少标题，待确认。");
  if (!recipient.trim()) checks.push("缺少报送或发送对象，待确认。");
  if (!facts.trim()) checks.push("缺少已确认事实材料，待确认。");
  if (/待确认/.test(content)) checks.push("正文仍含“待确认”，不得作为正式发文依据。");
  if (/\d/.test(content) && !facts.trim()) checks.push("出现数字但未提供事实材料，请人工核对。");
  return checks;
}
