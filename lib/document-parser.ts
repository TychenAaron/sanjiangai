// 统一正式知识文档解析器：将 Office、PDF 与纯文本转换为带定位上下文的可检索文本，不写 D1、R2、审计或模型上下文。
import { toMarkdown as docToMarkdown } from "@mdgate/doc";
import { toMarkdown as docxToMarkdown } from "@mdgate/docx";
import { toMarkdown as pdfToMarkdown } from "@mdgate/pdf";
import { toMarkdown as pptToMarkdown } from "@mdgate/ppt";
import { toMarkdown as pptxToMarkdown } from "@mdgate/pptx";
import { strFromU8, unzipSync } from "fflate";
import * as XLSX from "xlsx";

export type DocumentParseStatus = "parsed" | "pending_conversion" | "pending_ocr" | "failed";
export type DocumentBlock = {
  type: "heading" | "paragraph" | "list" | "table" | "sheet" | "slide" | "page";
  text: string;
  location: string;
  heading?: string;
};
export type ParsedDocument = {
  format: string;
  status: DocumentParseStatus;
  plainText: string;
  structuredBlocks: DocumentBlock[];
  title: string;
  headings: string[];
  paragraphs: string[];
  tables: string[][][];
  sheets: Array<{ name: string; rows: string[][] }>;
  slides: Array<{ page: number; title: string; text: string }>;
  pages: Array<{ page: number; text: string }>;
  metadata: { locations: string[]; parser: string };
  reason?: string;
};

const textFormats = new Set(["txt", "md", "csv", "tsv"]);
const supportedFormats = new Set(["txt", "md", "csv", "tsv", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "pdf"]);
const MAX_EXTRACTED_CHARS = 600_000;

function extensionOf(fileName: string) { return fileName.split(".").pop()?.toLowerCase() || "unknown"; }
function titleFromFileName(fileName: string) { return fileName.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "").trim() || "未命名资料"; }
function normalizeText(value: string) { return value.replace(/\r/g, "").replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim(); }
function decodeXml(value: string) { return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&"); }
function xmlText(value: string) { return normalizeText(decodeXml(value.replace(/<w:tab\/?[^>]*>/g, "\t").replace(/<w:br\/?[^>]*>/g, "\n").replace(/<\/w:p>/g, "\n").replace(/<\/a:p>/g, "\n").replace(/<[^>]+>/g, ""))); }
function emptyResult(format: string, title: string, status: DocumentParseStatus, reason: string, parser: string): ParsedDocument {
  return { format, status, plainText: "", structuredBlocks: [], title, headings: [], paragraphs: [], tables: [], sheets: [], slides: [], pages: [], metadata: { locations: [], parser }, reason };
}

/** 将 Markdown 的标题、段落、列表和表格转成统一块；输入不可信文本，输出不包含原始二进制或存储地址。 */
function blocksFromMarkdown(markdown: string, prefix = "", parser = "markdown"): ParsedDocument {
  const normalized = normalizeText(markdown);
  const title = normalized.match(/^#\s+(.+)$/m)?.[1]?.trim() || "未命名资料";
  const blocks: DocumentBlock[] = []; const headings: string[] = []; const paragraphs: string[] = []; const tables: string[][][] = [];
  let currentHeading = ""; let tableRows: string[][] = []; let paragraphLines: string[] = [];
  const flushParagraph = () => {
    const text = normalizeText(paragraphLines.join("\n")); paragraphLines = [];
    if (!text) return;
    const location = `${prefix || "正文"}第${paragraphs.length + 1}段`;
    const type: DocumentBlock["type"] = /^[-*+]\s|^\d+[.)、]\s/u.test(text) ? "list" : "paragraph";
    paragraphs.push(text); blocks.push({ type, text, location, heading: currentHeading || undefined });
  };
  const flushTable = () => {
    if (!tableRows.length) return;
    const index = tables.push(tableRows) - 1;
    const header = tableRows[0]?.filter(Boolean).join(" / ") || "表格";
    const rows = tableRows.slice(1).map((row) => row.map((value, columnIndex) => `${tableRows[0]?.[columnIndex] || `字段${columnIndex + 1}`}：${value}`).filter((value) => !value.endsWith("：")).join("；")).filter(Boolean);
    blocks.push({ type: "table", text: `${prefix ? `${prefix}\n` : ""}表格${index + 1}（字段：${header}）\n${rows.join("\n")}`.trim(), location: `${prefix || "正文"}表格${index + 1}`, heading: currentHeading || undefined });
    tableRows = [];
  };
  for (const rawLine of normalized.split("\n")) {
    const line = rawLine.trim(); const heading = line.match(/^(#{1,6})\s+(.+)$/);
    const isTable = /^\|.*\|$/.test(line);
    if (heading) { flushParagraph(); flushTable(); currentHeading = heading[2].trim(); headings.push(currentHeading); blocks.push({ type: "heading", text: currentHeading, location: `${prefix || "正文"}标题${headings.length}`, heading: currentHeading }); continue; }
    if (isTable) {
      flushParagraph(); const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      if (!cells.every((cell) => /^:?-{3,}:?$/.test(cell))) tableRows.push(cells);
      continue;
    }
    flushTable();
    if (!line) { flushParagraph(); continue; }
    paragraphLines.push(line);
  }
  flushParagraph(); flushTable();
  const plainText = blocks.map((block) => `${block.location}${block.heading ? `｜章节：${block.heading}` : ""}\n${block.text}`).join("\n\n");
  return { format: "markdown", status: plainText ? "parsed" : "pending_ocr", plainText, structuredBlocks: blocks, title, headings, paragraphs, tables, sheets: [], slides: [], pages: [], metadata: { locations: blocks.map((block) => block.location), parser } };
}

/** 读取 Excel 工作表并把每一行与表头组合为语义文本，避免仅保存零散单元格。 */
function parseSpreadsheet(fileName: string, buffer: ArrayBuffer): ParsedDocument {
  const format = extensionOf(fileName); const title = titleFromFileName(fileName);
  try {
    const workbook = XLSX.read(buffer, { type: "array", cellFormula: false, cellHTML: false, cellText: true });
    const sheets = workbook.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, raw: false, defval: "" }).map((row) => row.map((cell) => String(cell ?? "").trim())) }));
    const blocks: DocumentBlock[] = []; const tables: string[][][] = [];
    for (const sheet of sheets) {
      const populated = sheet.rows.filter((row) => row.some(Boolean)); if (!populated.length) continue;
      const headers = populated[0].map((value, index) => value || `字段${index + 1}`); tables.push(populated);
      blocks.push({ type: "sheet", text: `工作表：${sheet.name}\n字段：${headers.join(" / ")}`, location: `工作表“${sheet.name}”` });
      populated.slice(1).forEach((row, index) => {
        const values = headers.map((header, columnIndex) => row[columnIndex] ? `${header}：${row[columnIndex]}` : "").filter(Boolean);
        if (values.length) blocks.push({ type: "table", text: `工作表：${sheet.name}\n第${index + 2}行：${values.join("；")}`, location: `工作表“${sheet.name}”第${index + 2}行`, heading: sheet.name });
      });
    }
    const plainText = [`文档标题：${title}`, ...blocks.map((block) => `${block.location}\n${block.text}`)].join("\n\n");
    if (!blocks.length) return emptyResult(format, title, "pending_ocr", "工作表未包含可读文字，等待 OCR 处理", "xlsx");
    return { format, status: "parsed", plainText, structuredBlocks: blocks, title, headings: sheets.map((sheet) => sheet.name), paragraphs: [], tables, sheets, slides: [], pages: [], metadata: { locations: blocks.map((block) => block.location), parser: "xlsx" } };
  } catch (error) { return emptyResult(format, title, "failed", error instanceof Error ? `表格解析失败：${error.message}` : "表格解析失败", "xlsx"); }
}

/** OOXML 最小回退：仅在完整转换器无法识别精简但结构合法的 DOCX/PPTX 包时读取正文 XML，不伪造不存在的内容。 */
function parseOoxmlFallback(fileName: string, bytes: Uint8Array): ParsedDocument {
  const format = extensionOf(fileName); const title = titleFromFileName(fileName);
  try {
    const files = unzipSync(bytes);
    if (format === "docx") {
      const xml = files["word/document.xml"]; if (!xml) return emptyResult(format, title, "failed", "Word 文件缺少正文 XML", "ooxml-fallback");
      const text = xmlText(strFromU8(xml)); const parsed = blocksFromMarkdown(text, "正文", "ooxml-fallback");
      parsed.format = format; parsed.title = title; parsed.plainText = normalizeText(`文档标题：${title}\n${parsed.plainText}`);
      return parsed.plainText.length > `文档标题：${title}`.length ? parsed : emptyResult(format, title, "failed", "Word 文件未包含可读正文", "ooxml-fallback");
    }
    const paths = Object.keys(files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((left, right) => Number(left.match(/slide(\d+)/)?.[1] || 0) - Number(right.match(/slide(\d+)/)?.[1] || 0));
    const slides = paths.map((path, index) => ({ page: index + 1, title: `第${index + 1}页`, text: xmlText(strFromU8(files[path])) })).filter((slide) => slide.text);
    if (!slides.length) return emptyResult(format, title, "failed", "演示文件未包含可读幻灯片文字", "ooxml-fallback");
    const blocks = slides.map((slide) => ({ type: "slide" as const, text: `第${slide.page}页：${slide.text}`, location: `第${slide.page}页`, heading: slide.title }));
    return { format, status: "parsed", plainText: normalizeText(`文档标题：${title}\n${blocks.map((block) => `${block.location}\n${block.text}`).join("\n\n")}`), structuredBlocks: blocks, title, headings: slides.map((slide) => slide.title), paragraphs: slides.map((slide) => slide.text), tables: [], sheets: [], slides, pages: [], metadata: { locations: blocks.map((block) => block.location), parser: "ooxml-fallback" } };
  } catch (error) { return emptyResult(format, title, "failed", error instanceof Error ? `Office XML 回退解析失败：${error.message}` : "Office XML 回退解析失败", "ooxml-fallback"); }
}

/** 将 Office/PDF 转换器输出的 Markdown 归一化；转换异常不会被伪造为已解析内容。 */
async function parseMarkdownFile(fileName: string, bytes: Uint8Array): Promise<ParsedDocument> {
  const format = extensionOf(fileName); const title = titleFromFileName(fileName);
  try {
    const markdown = format === "doc" ? await docToMarkdown(bytes, { path: fileName })
      : format === "docx" ? await docxToMarkdown(bytes, { path: fileName })
      : format === "ppt" ? await pptToMarkdown(bytes, { path: fileName })
      : format === "pptx" ? await pptxToMarkdown(bytes, { path: fileName })
      : await pdfToMarkdown(bytes, { path: fileName });
    const parsed = blocksFromMarkdown(markdown, format === "pdf" ? "PDF" : format.toUpperCase(), `mdgate/${format}`);
    parsed.format = format; parsed.title = parsed.title === "未命名资料" ? title : parsed.title;
    if (!parsed.plainText) return emptyResult(format, title, format === "pdf" ? "pending_ocr" : "failed", format === "pdf" ? "未识别到可读 PDF 文本，已进入待 OCR 状态" : "未提取到可读正文", `mdgate/${format}`);
    if (format === "pdf") {
      const pageTexts = parsed.plainText.split(/(?:\f|^\s*#{1,6}\s*(?:第\s*)?\d+\s*页.*$)/m).map((page) => normalizeText(page)).filter(Boolean);
      parsed.pages = pageTexts.map((text, index) => ({ page: index + 1, text }));
      parsed.pages.forEach((page) => parsed.structuredBlocks.push({ type: "page", text: page.text, location: `第${page.page}页` }));
    }
    if (format === "ppt" || format === "pptx") {
      const headings = parsed.headings.length ? parsed.headings : parsed.paragraphs.filter(Boolean);
      parsed.slides = headings.map((slideTitle, index) => ({ page: index + 1, title: slideTitle, text: slideTitle }));
      parsed.slides.forEach((slide) => parsed.structuredBlocks.push({ type: "slide", text: `第${slide.page}页：${slide.text}`, location: `第${slide.page}页`, heading: slide.title }));
    }
    parsed.metadata.locations = parsed.structuredBlocks.map((block) => block.location);
    parsed.plainText = normalizeText(`文档标题：${parsed.title}\n${parsed.structuredBlocks.map((block) => `${block.location}${block.heading ? `｜章节：${block.heading}` : ""}\n${block.text}`).join("\n\n")}`);
    return parsed;
  } catch (error) {
    if (format === "docx" || format === "pptx") return parseOoxmlFallback(fileName, bytes);
    return emptyResult(format, title, format === "pdf" ? "pending_ocr" : "failed", error instanceof Error ? `解析失败：${error.message}` : "解析失败", `mdgate/${format}`);
  }
}

/**
 * 将项目内 PaddleOCR 服务的 JSON 归一为正式资料解析结构。
 * 输入为服务端 OCR 页面、文字块和表格摘要，输出不包含原始图片或服务地址，供统一分段和索引管线继续处理。
 */
export function parseOcrResponse(fileName: string, response: { text?: unknown; pages?: unknown; tables?: unknown; metadata?: unknown }, unavailableReason?: string): ParsedDocument {
  const title = titleFromFileName(fileName); const format = extensionOf(fileName);
  const pageRows = Array.isArray(response.pages) ? response.pages : [];
  const blocks: DocumentBlock[] = [];
  const pages: Array<{ page: number; text: string }> = [];
  for (const [index, row] of pageRows.entries()) {
    const item = row && typeof row === "object" ? row as { page?: unknown; text?: unknown; blocks?: unknown } : {};
    const page = Number(item.page) || index + 1; const text = normalizeText(typeof item.text === "string" ? item.text : "");
    if (!text) continue;
    pages.push({ page, text });
    blocks.push({ type: "page", text, location: `第${page}页`, heading: `第${page}页` });
    if (Array.isArray(item.blocks)) for (const block of item.blocks) {
      const blockText = normalizeText(typeof (block as { text?: unknown })?.text === "string" ? (block as { text: string }).text : "");
      if (blockText) blocks.push({ type: "paragraph", text: blockText, location: `第${page}页文字块${blocks.length + 1}`, heading: `第${page}页` });
    }
  }
  const tableBlocks = Array.isArray(response.tables) ? response.tables : [];
  for (const [index, table] of tableBlocks.entries()) {
    const item = table && typeof table === "object" ? table as { page?: unknown; text?: unknown } : {};
    const text = normalizeText(typeof item.text === "string" ? item.text : "");
    if (text) blocks.push({ type: "table", text, location: `第${Number(item.page) || 1}页表格${index + 1}`, heading: `第${Number(item.page) || 1}页` });
  }
  const fallbackText = normalizeText(typeof response.text === "string" ? response.text : "");
  if (!blocks.length && fallbackText) blocks.push({ type: "page", text: fallbackText, location: "OCR 正文", heading: "OCR 识别结果" });
  const plainText = normalizeText(`文档标题：${title}\n${blocks.map((block) => `${block.location}${block.heading ? `｜章节：${block.heading}` : ""}\n${block.text}`).join("\n\n")}`);
  if (blocks.length) return { format, status: "parsed", plainText, structuredBlocks: blocks, title, headings: pages.map((page) => `第${page.page}页`), paragraphs: blocks.filter((block) => block.type === "paragraph" || block.type === "page").map((block) => block.text), tables: [], sheets: [], slides: [], pages, metadata: { locations: blocks.map((block) => block.location), parser: "paddleocr" } };
  return emptyResult(format, title, "pending_ocr", unavailableReason || "OCR 未识别到可读文字，等待管理员重新解析", "paddleocr");
}

/** 统一解析入口。输入为已完成文件签名预检的原始字节，输出为标准结构、可检索文本与真实解析状态。 */
export async function parseDocument(input: { fileName: string; mimeType?: string; buffer: ArrayBuffer }): Promise<ParsedDocument> {
  const format = extensionOf(input.fileName); const title = titleFromFileName(input.fileName);
  if (!supportedFormats.has(format)) return emptyResult(format, title, "failed", "不支持的文件类型", "none");
  if (format === "xlsx" || format === "xls") return parseSpreadsheet(input.fileName, input.buffer);
  if (textFormats.has(format)) {
    const lines = new TextDecoder().decode(input.buffer).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const markdown = format === "md" ? lines.join("\n") : lines.map((line, index) => `第${index + 1}段：${line}`).join("\n\n");
    const parsed = blocksFromMarkdown(markdown, "正文", format);
    parsed.format = format; parsed.title = title; parsed.plainText = normalizeText(`文档标题：${title}\n${parsed.plainText}`);
    return parsed.plainText.length > `文档标题：${title}`.length ? parsed : emptyResult(format, title, "pending_ocr", "未识别到可读正文", format);
  }
  const parsed = await parseMarkdownFile(input.fileName, new Uint8Array(input.buffer));
  if (parsed.plainText.length > MAX_EXTRACTED_CHARS) return emptyResult(format, parsed.title, "failed", "文件正文过长，请拆分后上传", parsed.metadata.parser);
  return parsed;
}
