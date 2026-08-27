import { eq } from "drizzle-orm";
import { strFromU8, unzipSync } from "fflate";
import { getDb } from "../db";
import { documentChunks } from "../db/schema";
import { parseWritingReference } from "./writing-reference-parser";

const MAX_EXTRACTED_CHARS = 600_000;

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function normalizeText(value: string) {
  return value.replace(/\r/g, "").replace(/[\t ]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function extractDocx(bytes: Uint8Array) {
  const files = unzipSync(bytes);
  const documentXml = files["word/document.xml"];
  if (!documentXml) throw new Error("该Word文件缺少正文，暂时无法解析");
  const xml = strFromU8(documentXml);
  return normalizeText(decodeXml(xml
    .replace(/<w:tab\/?[^>]*>/g, "\t")
    .replace(/<w:br\/?[^>]*>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")));
}

export async function extractUpload(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (!new Set(["txt", "md", "docx", "pdf", "xlsx", "xls", "pptx", "ppt"]).has(extension)) {
    throw new Error("仅支持 DOCX、PDF、TXT、MD、XLSX、XLS、PPTX 和 PPT 文件");
  }
  if (file.size <= 0) throw new Error("上传文件为空");
  if (file.size > 8 * 1024 * 1024) throw new Error("单个试用文件不得超过8MB");
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const isCompoundOffice = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  const isPdf = new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  // 扩展名与二进制容器必须相符，防止把文本或任意文件伪装成 Office/PDF 后留下空资料。
  if (["docx", "xlsx", "pptx"].includes(extension) && !isZip) throw new Error("文件扩展名与 Office 文件格式不匹配");
  if (["xls", "ppt"].includes(extension) && !isCompoundOffice) throw new Error("文件扩展名与旧版 Office 文件格式不匹配");
  if (extension === "pdf" && !isPdf) throw new Error("文件扩展名与 PDF 文件格式不匹配");
  if (extension === "docx") extractDocx(bytes);
  // 正式资料与私有参考共用经过验证的 Office 解析器，避免同一格式在两条上传链路中出现不同结果。
  const parsed = await parseWritingReference({ fileName: file.name, mimeType: file.type, buffer });
  if (parsed.status === "failed") throw new Error("文件损坏、伪造扩展名或无法解析");
  const content = normalizeText(parsed.text);
  if (parsed.status === "parsed" && !content) throw new Error("没有从文件中识别到可用正文");
  if (content.length > MAX_EXTRACTED_CHARS) throw new Error("文件正文过长，请拆分后上传");
  return { buffer, content, extension, parseStatus: parsed.status, parseReason: parsed.reason || null, locations: parsed.locations };
}

export function splitIntoChunks(input: string) {
  const text = normalizeText(input);
  const paragraphs = text.split(/\n+/).map(item => item.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const pieces = paragraph.length > 900 ? paragraph.match(/[\s\S]{1,780}/g) || [] : [paragraph];
    for (const piece of pieces) {
      if (current && current.length + piece.length + 1 > 900) {
        chunks.push(current);
        current = `${current.slice(-100)}\n${piece}`;
      } else current = current ? `${current}\n${piece}` : piece;
    }
  }
  if (current) chunks.push(current);
  return chunks.slice(0, 800);
}

export async function indexDocumentVersion(documentId: string, versionId: string, content: string) {
  const db = getDb();
  const chunks = splitIntoChunks(content);
  await db.delete(documentChunks).where(eq(documentChunks.versionId, versionId));
  if (chunks.length) {
    const now = new Date().toISOString();
    await db.insert(documentChunks).values(chunks.map((chunk, chunkIndex) => ({
      id: crypto.randomUUID(), documentId, versionId, chunkIndex, content: chunk, charCount: chunk.length, createdAt: now,
    })));
  }
  return chunks.length;
}

export function safeStorageName(value: string) {
  return value.normalize("NFKC").replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "document";
}
