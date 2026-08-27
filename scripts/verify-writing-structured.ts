// 本脚本仅用完全虚构文字验证结构化公文生成和 DOCX XML；不访问 D1、R2、页面、模型或网络服务。
import { strFromU8, unzipSync } from "fflate";
import { createWritingDocx } from "../lib/docx-export.ts";
import { generateStructuredWriting, structuredWritingToText } from "../lib/writing-structured.ts";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

// 输入为虚构文种与事实，输出为各类公文共同应具备的标题、编号和真实表格区块。
function verifyDraft(type: "请示" | "通知" | "工作情况汇报") {
  const draft = generateStructuredWriting({
    type,
    title: `本机测试${type}`,
    recipient: "本机测试对象",
    submittingDepartment: "本机测试部门",
    facts: "本机测试事实：仅用于验证，不涉及真实单位、金额、日期或政策。",
    references: [],
    privateReferenceCount: 1,
  });
  assert(draft.blocks.some((block) => block.type === "heading"), `${type} 缺少标题区块`);
  assert(draft.blocks.some((block) => block.type === "numbered_list"), `${type} 缺少编号列表区块`);
  assert(draft.blocks.some((block) => block.type === "table"), `${type} 缺少表格区块`);
  assert(structuredWritingToText(draft).includes("【待人工核验】"), `${type} 未保留待人工核验提示`);
  assert(!JSON.stringify(draft).includes("私有参考材料.docx"), `${type} 私有材料文件名不应进入正文`);
  return draft;
}

const drafts = (["请示", "通知", "工作情况汇报"] as const).map(verifyDraft);
const bytes = createWritingDocx({
  title: drafts[0].title,
  documentType: drafts[0].documentType,
  finalContent: structuredWritingToText(drafts[0]),
  structured: drafts[0],
  references: [{ title: "本机测试正式依据", version: 1, sourceType: "本机测试", location: "第1段" }],
});
const archive = unzipSync(bytes);
const documentXml = strFromU8(archive["word/document.xml"]);
assert(archive["word/numbering.xml"], "DOCX 缺少真正的编号定义文件");
assert(documentXml.includes("<w:numPr>"), "DOCX 编号列表不是 Word 编号 XML");
assert(documentXml.includes("<w:tbl>"), "DOCX 表格不是 Word 表格 XML");
assert(documentXml.includes("本机测试正式依据"), "正式引用附录未写入 DOCX");
assert(!documentXml.includes("私有参考材料.docx"), "私有参考材料泄露到 DOCX");
const rawContent = "本机虚构连续正文验收\n一、背景与必要性\n本机虚构第一段，用于验证自然段分页与中文显示。\n（二）工作安排\n本机虚构第二段，内容完整且不涉及真实资料。\n1. 本机虚构编号事项。\n【待人工核验】本机虚构待核验提示。\n请结合本机情况组织落实。";
const rawArchive = unzipSync(createWritingDocx({ title: "本机虚构连续正文验收", documentType: "通知", finalContent: rawContent, references: [], structured: {} as never }));
const rawXml = strFromU8(rawArchive["word/document.xml"]);
assert(rawXml.includes("本机虚构第二段") && rawXml.includes("【待人工核验】"), "连续正文 DOCX 缺少完整文本");
assert((rawXml.match(/本机虚构连续正文验收/g) || []).length === 1, "连续正文 DOCX 重复导出标题");
assert((rawXml.match(/<w:p>/g) || []).length >= 8, "连续正文必须按自然行生成多个 Word 段落");
console.log("PASS 三种虚构文种均生成结构化正文；DOCX 含真实编号、表格和正式引用附录，且未包含私有材料。");
