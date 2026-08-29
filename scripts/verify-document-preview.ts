// 本脚本使用内存虚构文件验证知识资源预览分支、解析结果与 ACL 代理约束；不访问 D1、R2、模型或真实资料。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import { strToU8, zipSync } from "fflate";
import { buildDocumentPreview } from "../lib/document-preview.ts";

function asBuffer(value: Uint8Array) {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

// 说明：校验预览转换器对虚构 DOCX、PPTX、XLSX、PDF、TXT、MD 与待转换 PPT 的输出；输入只在内存中生成，输出是断言结果。
function verifyPreviewFormats() {
  const docx = zipSync({ "word/document.xml": strToU8("<w:document><w:body><w:p><w:r><w:t>虚构 DOCX 标题</w:t></w:r></w:p><w:p><w:r><w:t>完整正文段落</w:t></w:r></w:p></w:body></w:document>") });
  const docxPreview = buildDocumentPreview({ fileName: "虚构.docx", buffer: asBuffer(docx), fallbackText: "兜底内容", parseStatus: "parsed" });
  assert.equal(docxPreview.kind, "document");
  assert.match(docxPreview.text, /虚构 DOCX 标题/);
  assert.match(docxPreview.text, /完整正文段落/);

  const pptx = zipSync({
    "ppt/slides/slide2.xml": strToU8("<p:sld><a:t>第二页正文</a:t></p:sld>"),
    "ppt/slides/slide1.xml": strToU8("<p:sld><a:t>第一页标题</a:t></p:sld>"),
  });
  const pptxPreview = buildDocumentPreview({ fileName: "虚构.pptx", buffer: asBuffer(pptx), fallbackText: "", parseStatus: "parsed" });
  assert.equal(pptxPreview.kind, "slides");
  assert.deepEqual(pptxPreview.slides.map((slide) => slide.page), [1, 2]);
  assert.match(pptxPreview.slides[0].text, /第一页标题/);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["姓名", "部门"], ["虚构员工", "虚构部门"]]), "人员表");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["阶段", "状态"], ["验证", "完成"]]), "进度表");
  const xlsxPreview = buildDocumentPreview({ fileName: "虚构.xlsx", buffer: XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer, fallbackText: "", parseStatus: "parsed" });
  assert.equal(xlsxPreview.kind, "spreadsheet");
  assert.deepEqual(xlsxPreview.sheets.map((sheet) => sheet.name), ["人员表", "进度表"]);
  assert.equal(xlsxPreview.sheets[0].rows[1][0], "虚构员工");

  assert.equal(buildDocumentPreview({ fileName: "虚构.pdf", fallbackText: "PDF 正文", parseStatus: "pending_ocr" }).kind, "pdf");
  assert.equal(buildDocumentPreview({ fileName: "虚构.txt", fallbackText: "TXT 全文", parseStatus: "parsed" }).kind, "text");
  assert.equal(buildDocumentPreview({ fileName: "虚构.md", fallbackText: "# Markdown", parseStatus: "parsed" }).kind, "markdown");
  const pptPreview = buildDocumentPreview({ fileName: "虚构.ppt", fallbackText: "", parseStatus: "pending_conversion" });
  assert.equal(pptPreview.kind, "pending");
  assert.match(pptPreview.message, /待转换/);
}

// 说明：静态核验两个受控接口在读取内容前复用 ACL，并且 JSON 预览响应不返回底层 storageKey；输入是接口源码，输出是安全约束断言。
async function verifySecureRoutes() {
  const [documentsRoute, previewRoute, fileRoute] = await Promise.all([
    readFile(new URL("../app/api/documents/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/documents/[id]/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/documents/[id]/file/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(previewRoute, /canReadDocument\(user, document, grants\)/);
  assert.match(fileRoute, /canReadDocument\(user, document, grants\)/);
  assert.match(fileRoute, /Cache-Control[\s\S]*private, no-store/);
  assert.match(documentsRoute, /delete visibleDocument\.storageKey/);
  assert.doesNotMatch(previewRoute, /\bstorageKey\s*:/);
  assert.doesNotMatch(fileRoute, /redirect\(/);
}

verifyPreviewFormats();
await verifySecureRoutes();
console.log("document preview verification passed");
