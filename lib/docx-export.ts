// 本文件把已通过权限校验的结构化公文内容组装为 DOCX；不读取数据库、不判断账号权限，也不导出私有参考材料。
import { strToU8, zipSync } from "fflate";
import type { StructuredWriting, WritingBlock } from "./writing-structured";

export type WritingExportReference = { title: string; version: number; sourceType: string; location: string };

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function runXml(value: string, options: { bold?: boolean; color?: string; size?: number } = {}) {
  const properties = ["<w:rFonts w:ascii=\"Times New Roman\" w:hAnsi=\"Times New Roman\" w:eastAsia=\"SimSun\"/>", options.bold ? "<w:b/>" : "", options.color ? `<w:color w:val="${options.color}"/>` : "", options.size ? `<w:sz w:val="${options.size}"/><w:szCs w:val="${options.size}"/>` : ""].join("");
  const text = value.split(/\r?\n/).map((line, index) => `${index ? "<w:br/>" : ""}<w:t xml:space="preserve">${escapeXml(line)}</w:t>`).join("");
  return `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ""}${text}</w:r>`;
}

// 将一段文字变为 Word 段落。待核验内容使用醒目颜色，但不会替代人工核验。
function paragraphXml(value: string, options: { bold?: boolean; align?: "center"; headingLevel?: 1 | 2 | 3; numbered?: boolean; notice?: boolean; compact?: boolean } = {}) {
  const paragraphProperties = [
    options.align ? `<w:jc w:val="${options.align}"/>` : "",
    options.headingLevel ? `<w:outlineLvl w:val="${options.headingLevel - 1}"/><w:spacing w:before="${options.headingLevel === 1 ? 360 : 240}" w:after="120"/>` : "",
    !options.headingLevel && !options.numbered && !options.compact ? "<w:ind w:firstLine=\"420\"/><w:spacing w:line=\"420\" w:lineRule=\"auto\" w:after=\"120\"/>" : "",
    options.numbered ? "<w:numPr><w:ilvl w:val=\"0\"/><w:numId w:val=\"1\"/></w:numPr><w:spacing w:line=\"360\" w:lineRule=\"auto\" w:after=\"80\"/>" : "",
    options.notice ? "<w:shd w:val=\"clear\" w:fill=\"FFF4E5\"/><w:spacing w:before=\"80\" w:after=\"80\"/>" : "",
  ].join("");
  const color = options.notice || value.includes("【待人工核验】") ? "C00000" : undefined;
  return `<w:p>${paragraphProperties ? `<w:pPr>${paragraphProperties}</w:pPr>` : ""}${runXml(value, { bold: options.bold || Boolean(options.headingLevel), color, size: options.headingLevel ? 28 : undefined })}</w:p>`;
}

function tableCellXml(value: string, width: number, header = false) {
  const cellProperties = `<w:tcW w:w="${width}" w:type="dxa"/>${header ? "<w:shd w:val=\"clear\" w:fill=\"DCE6F1\"/>" : ""}<w:vAlign w:val="center"/>`;
  return `<w:tc><w:tcPr>${cellProperties}</w:tcPr>${paragraphXml(value, { bold: header, compact: true })}</w:tc>`;
}

// 输入为结构化表格区块，输出为真实 Word 表格 XML；列数和单元格文本已在 API 层验证。
function tableXml(block: Extract<WritingBlock, { type: "table" }>) {
  const width = Math.floor(9000 / block.columns.length);
  const grid = block.columns.map(() => `<w:gridCol w:w="${width}"/>`).join("");
  const row = (cells: string[], header = false) => `<w:tr>${header ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${cells.map((cell) => tableCellXml(cell, width, header)).join("")}</w:tr>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="6" w:color="9AAABD"/><w:left w:val="single" w:sz="6" w:color="9AAABD"/><w:bottom w:val="single" w:sz="6" w:color="9AAABD"/><w:right w:val="single" w:sz="6" w:color="9AAABD"/><w:insideH w:val="single" w:sz="4" w:color="B7C4D1"/><w:insideV w:val="single" w:sz="4" w:color="B7C4D1"/></w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${row(block.columns, true)}${block.rows.map((cells) => row(cells)).join("")}</w:tbl>`;
}

function structuredBodyXml(structured: StructuredWriting) {
  const metadata = [`文种：${structured.documentType}`, structured.recipient ? `主送/呈报对象：${structured.recipient}` : "", structured.submittingDepartment ? `发文/呈报单位：${structured.submittingDepartment}` : "", structured.dateLabel ? `日期：${structured.dateLabel}` : ""].filter(Boolean);
  const blocks = structured.blocks.map((block) => {
    if (block.type === "heading") return block.text.trim() ? paragraphXml(block.text, { headingLevel: block.level }) : "";
    if (block.type === "paragraph") return block.text.trim() ? paragraphXml(block.text) : "";
    if (block.type === "notice") return block.text.trim() ? paragraphXml(block.text, { notice: true }) : "";
    if (block.type === "numbered_list") return block.items.filter((item) => item.trim()).map((item) => paragraphXml(item, { numbered: true })).join("");
    if (block.type === "table") return tableXml(block);
    return "";
  }).join("");
  return [paragraphXml(structured.title, { bold: true, align: "center" }), ...metadata.map((item) => paragraphXml(item, { compact: true })), paragraphXml(""), blocks].join("");
}

// 将非结构化模型正文按自然行输出为独立 Word 段落。输入为完整纯文本，输出不拆分字符或 run；首行标题与当前标题重复时只保留一次。
function rawBodyXml(input: { title: string; documentType: string; content: string }) {
  const lines = input.content.replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines[0] === input.title.trim()) lines.shift();
  const paragraphs = lines.map((line) => {
    if (/^[一二三四五六七八九十]+、/.test(line)) return paragraphXml(line, { headingLevel: 1 });
    if (/^[（(][一二三四五六七八九十]+[）)]/.test(line)) return paragraphXml(line, { headingLevel: 2 });
    if (/^\d+[.、]\s*/.test(line)) return paragraphXml(line.replace(/^\d+[.、]\s*/, ""), { numbered: true });
    return paragraphXml(line);
  }).join("");
  return [paragraphXml(input.title, { bold: true, align: "center" }), paragraphXml(`文种：${input.documentType}`, { compact: true }), paragraphXml(""), paragraphs].join("");
}

// 仅接受包含有效区块数组的结构化对象，防止历史空对象 {} 误走表格/标题结构化导出分支。
function hasStructuredBlocks(value: StructuredWriting | null | undefined): value is StructuredWriting {
  return Boolean(value && Array.isArray(value.blocks) && value.blocks.length > 0);
}

// 生成可由 Word 打开的 DOCX。输入只能来自导出 API 已验证的工作区最新版本与正式引用，输出为二进制压缩包。
export function createWritingDocx(input: { title: string; documentType: string; finalContent: string; references: WritingExportReference[]; structured?: StructuredWriting | null }) {
  const body = hasStructuredBlocks(input.structured)
    ? structuredBodyXml(input.structured)
    : rawBodyXml({ title: input.title, documentType: input.documentType, content: input.finalContent });
  const appendix = input.references.length
    ? [paragraphXml("附录：正式引用依据（仅供核验）", { bold: true, headingLevel: 1 }), ...input.references.map((item, index) => paragraphXml(`[${index + 1}] 《${item.title}》V${item.version}.0 · ${item.sourceType} · ${item.location}`, { compact: true }))].join("")
    : "";
  const footer = paragraphXml("仅供人工审核，导出不代表审批、发文或进入知识资源。", { notice: true });
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}${appendix}${footer}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
  const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="720"/></w:tabs><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
  return zipSync({
    "[Content_Types].xml": strToU8("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/><Override PartName=\"/word/numbering.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml\"/></Types>"),
    "_rels/.rels": strToU8("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>"),
    "word/document.xml": strToU8(documentXml),
    "word/_rels/document.xml.rels": strToU8("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering\" Target=\"numbering.xml\"/></Relationships>"),
    "word/numbering.xml": strToU8(numberingXml),
  });
}

// 生成浏览器下载用的安全文件名，避免用户标题造成路径解释或响应头注入。
export function createWritingDownloadName(documentType: string, title: string) {
  const safeTitle = title.normalize("NFKC").replace(/[\\/:*?"<>|\u0000-\u001F]+/g, "-").trim().slice(0, 80) || "未命名公文";
  const safeType = documentType.normalize("NFKC").replace(/[\\/:*?"<>|\u0000-\u001F]+/g, "-").trim().slice(0, 20) || "公文";
  return `${safeType}-${safeTitle}-人工审核稿.docx`;
}
