// 本文件仅解析公文工作区的本机虚构参考材料，不写数据库、R2 或公共知识库。
import * as XLSX from "xlsx";
import { strFromU8, unzipSync } from "fflate";

export type ReferenceParseResult = { format: string; status: "parsed" | "pending_conversion" | "pending_ocr" | "failed"; text: string; locations: string[]; reason?: string };
const textFormats = new Set(["txt", "md", "csv", "tsv"]);
const xmlText = (xml: string) => xml.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

// 说明：输入为文件名、MIME 与内存字节，输出仅为可读文字和定位；旧 .doc 固定待转换，图片和扫描内容不被伪装为已提取文字。
export async function parseWritingReference(input: { fileName: string; mimeType?: string; buffer: ArrayBuffer }): Promise<ReferenceParseResult> {
  const format = input.fileName.split(".").pop()?.toLowerCase() || "unknown";
  const bytes = new Uint8Array(input.buffer);
  if (format === "doc") return { format, status: "pending_conversion", text: "", locations: [], reason: "旧版 Word .doc 当前未接入经验证的 Worker 解析器，待转换或待 OCR" };
  if (textFormats.has(format)) {
    const paragraphs = new TextDecoder().decode(bytes).split(/\r?\n+/).map((line) => line.trim()).filter(Boolean);
    return { format, status: paragraphs.length ? "parsed" : "pending_ocr", text: paragraphs.map((line, index) => `第${index + 1}段：${line}`).join("\n"), locations: paragraphs.map((_, index) => `第${index + 1}段`), reason: paragraphs.length ? undefined : "已保存，但当前无法提取图片文字" };
  }
  if (format === "xlsx" || format === "xls") {
    try { const book = XLSX.read(input.buffer, { type: "array" }); const locations: string[] = []; const lines: string[] = [];
      for (const name of book.SheetNames) { const rows = XLSX.utils.sheet_to_json<string[]>(book.Sheets[name], { header: 1, defval: "" }); rows.forEach((row, index) => { const value = row.filter(Boolean).join(" | "); if (value) { locations.push(`工作表“${name}”第${index + 1}行`); lines.push(`${locations.at(-1)}：${value}`); } }); }
      return { format, status: lines.length ? "parsed" : "pending_ocr", text: lines.join("\n"), locations, reason: lines.length ? undefined : "工作表未包含可读文本，待 OCR 或人工转换" };
    } catch (error) { return { format, status: "failed", text: "", locations: [], reason: error instanceof Error ? `表格解析失败：${error.message}` : "表格解析失败" }; }
  }
  if (format === "docx" || format === "pptx") {
    try { const files = unzipSync(bytes); const paths = format === "docx" ? ["word/document.xml"] : Object.keys(files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort(); const locations: string[] = []; const lines: string[] = [];
      paths.forEach((path, index) => { const value = xmlText(strFromU8(files[path])).replace(/\s+/g, " ").trim(); if (value) { const location = format === "docx" ? `第${index + 1}段` : `第${index + 1}页`; locations.push(location); lines.push(`${location}：${value}`); } });
      return { format, status: lines.length ? "parsed" : "pending_ocr", text: lines.join("\n"), locations, reason: lines.length ? undefined : "已保存，但当前无法提取图片文字" };
    } catch (error) { return { format, status: "failed", text: "", locations: [], reason: error instanceof Error ? `Office XML 解析失败：${error.message}` : "Office XML 解析失败" }; }
  }
  if (format === "ppt") return { format, status: "pending_conversion", text: "", locations: [], reason: "旧版 PowerPoint .ppt 需要有效二进制样例完成 Worker 实测，当前待转换或待 OCR" };
  return { format, status: "failed", text: "", locations: [], reason: "不支持的参考材料格式" };
}
