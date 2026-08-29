// 验证统一正式资料解析器：仅生成完全虚构的内存夹具，不访问 D1、R2、模型、OCR 服务或真实资料。
import { strToU8, zipSync } from "fflate";
import * as XLSX from "xlsx";
import { parseDocument, parseOcrResponse } from "../lib/document-parser.ts";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function bufferOf(bytes: Uint8Array) { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer; }

/** 构造最小文本型 PDF；正文完全虚构，用于验证 PDF 文字提取而非 OCR。 */
function textPdf(text: string) {
  return new TextEncoder().encode(`%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length ${text.length + 35} >>\nstream\nBT /F1 12 Tf 72 720 Td (${text}) Tj ET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF`);
}

/** 运行格式解析断言。输入为完全虚构文件字节，输出为统一正文、结构块和真实解析状态。 */
async function main() {
  const docx = zipSync({ "word/document.xml": strToU8("<w:document><w:body><w:p><w:t>虚构 Word 标题</w:t></w:p><w:p><w:t>虚构 Word 正文段落</w:t></w:p></w:body></w:document>") });
  const docxResult = await parseDocument({ fileName: "virtual.docx", buffer: bufferOf(docx) });
  assert(docxResult.status === "parsed" && docxResult.plainText.includes("虚构 Word 正文段落") && docxResult.structuredBlocks.length > 0, "DOCX 应生成结构化正文");

  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["员工类型", "上班时间", "下班时间"], ["虚构正常班", "08:30", "18:30"]]), "虚构考勤表");
  const xlsx = new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
  const xlsxResult = await parseDocument({ fileName: "virtual.xlsx", buffer: bufferOf(xlsx) });
  assert(xlsxResult.status === "parsed" && xlsxResult.plainText.includes("工作表：虚构考勤表") && xlsxResult.plainText.includes("上班时间：08:30"), "XLSX 必须保留工作表、表头和行语义");

  const pptx = zipSync({ "[Content_Types].xml": strToU8("<Types/>"), "ppt/slides/slide1.xml": strToU8("<p:sld><a:t>虚构演示标题</a:t><a:t>虚构演示正文</a:t></p:sld>") });
  const pptxResult = await parseDocument({ fileName: "virtual.pptx", buffer: bufferOf(pptx) });
  assert(pptxResult.status === "parsed" && pptxResult.slides.length === 1 && pptxResult.plainText.includes("第1页"), "PPTX 必须保留页码和正文");

  const textResult = await parseDocument({ fileName: "virtual.txt", buffer: new TextEncoder().encode("虚构文本第一段\n虚构文本第二段").buffer });
  assert(textResult.status === "parsed" && textResult.paragraphs.length === 2, "TXT 必须按段落解析");

  const pdfResult = await parseDocument({ fileName: "virtual.pdf", buffer: bufferOf(textPdf("VIRTUAL PDF CONTENT")) });
  assert(pdfResult.status === "parsed" && pdfResult.plainText.includes("VIRTUAL PDF CONTENT") && pdfResult.pages.length >= 1, "文本型 PDF 必须提取正文和页定位");
  const scannedPdf = await parseDocument({ fileName: "virtual-scanned.pdf", buffer: new TextEncoder().encode("%PDF-1.4\n%%EOF").buffer });
  assert(scannedPdf.status === "pending_ocr" && !scannedPdf.plainText, "无文字 PDF 必须真实标记为待 OCR");

  const ocrResult = parseOcrResponse("virtual-scanned.pdf", { text: "虚构考勤表 正常班 08:30", pages: [{ page: 1, text: "虚构考勤表\n正常班 08:30", blocks: [{ text: "虚构考勤表" }, { text: "正常班 08:30" }] }], tables: [{ page: 1, text: "表格：班次 / 上班时间\n正常班 / 08:30" }] });
  assert(ocrResult.status === "parsed" && ocrResult.plainText.includes("第1页") && ocrResult.structuredBlocks.some((block) => block.type === "table"), "OCR 结果必须保留页码、文字块和表格语义");

  const source = await (await import("node:fs/promises")).readFile(new URL("../lib/document-parser.ts", import.meta.url), "utf8");
  for (const format of ["@mdgate/doc", "@mdgate/docx", "@mdgate/ppt", "@mdgate/pptx", "@mdgate/pdf"]) assert(source.includes(format), `统一解析器缺少 ${format} 支持`);
  console.log("PASS 统一解析：DOCX、XLSX、PPTX、TXT、文本型 PDF 已解析；扫描 PDF 安全标记为待 OCR；DOC/PPT 使用同一纯 JavaScript 转换器路径。");
}

void main();
