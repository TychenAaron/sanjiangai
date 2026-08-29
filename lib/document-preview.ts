// 本文件把已获授权的正式资料原文件转换为浏览器预览数据；只在服务端内存处理，不写 D1、R2、索引或 RAG。
import * as XLSX from "xlsx";
import { strFromU8, unzipSync } from "fflate";

export type DocumentPreview =
  | { kind: "pdf"; message: string }
  | { kind: "text" | "markdown" | "document"; text: string }
  | { kind: "spreadsheet"; sheets: Array<{ name: string; rows: string[][] }> }
  | { kind: "slides"; slides: Array<{ page: number; text: string }> }
  | { kind: "pending"; message: string };

function extensionOf(fileName: string) { return fileName.split(".").pop()?.toLowerCase() || ""; }
function decodeXml(value: string) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
function xmlText(value: string) { return decodeXml(value.replace(/<w:tab\/?[^>]*>/g, "\t").replace(/<w:br\/?[^>]*>/g, "\n").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "")); }
function slideNumber(path: string) { return Number(path.match(/slide(\d+)\.xml$/)?.[1] || 0); }

// 说明：将当前版本的原文件转换为最小可读预览。输入为已通过 ACL 的文件名、二进制与解析兜底正文；输出不含 R2 key 或任何数据库内部信息。
export function buildDocumentPreview(input: { fileName: string; buffer?: ArrayBuffer; fallbackText: string; parseStatus: string }): DocumentPreview {
  const extension = extensionOf(input.fileName);
  if (extension === "pdf") return { kind: "pdf", message: "PDF 原文件将通过平台受控地址内嵌预览；OCR 状态不影响原件阅读。" };
  if (extension === "ppt" && input.parseStatus !== "parsed") return { kind: "pending", message: "该文件已入库，待转换后支持全文预览。" };
  if (input.parseStatus !== "parsed") return { kind: "pending", message: "该文件已入库，待完成解析后支持全文预览。" };
  if (extension === "txt") return { kind: "text", text: input.fallbackText };
  if (extension === "md") return { kind: "markdown", text: input.fallbackText };
  if (!input.buffer) return { kind: "document", text: input.fallbackText };
  try {
    if (extension === "xlsx" || extension === "xls") {
      const book = XLSX.read(input.buffer, { type: "array" });
      const sheets = book.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json<string[]>(book.Sheets[name], { header: 1, raw: false, defval: "" }).map((row) => row.map((cell) => String(cell))) }));
      return { kind: "spreadsheet", sheets };
    }
    if (extension === "pptx") {
      const files = unzipSync(new Uint8Array(input.buffer));
      const slides = Object.keys(files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((left, right) => slideNumber(left) - slideNumber(right)).map((path) => ({ page: slideNumber(path), text: xmlText(strFromU8(files[path])).replace(/\s+/g, " ").trim() })).filter((slide) => slide.text);
      return slides.length ? { kind: "slides", slides } : { kind: "pending", message: "当前文件未提取到可读幻灯片文字。" };
    }
    if (extension === "docx") {
      const files = unzipSync(new Uint8Array(input.buffer)); const xml = files["word/document.xml"];
      const text = xml ? xmlText(strFromU8(xml)).replace(/\n{3,}/g, "\n\n").trim() : input.fallbackText;
      return { kind: "document", text };
    }
  } catch {
    return { kind: "document", text: input.fallbackText };
  }
  return { kind: "document", text: input.fallbackText };
}
