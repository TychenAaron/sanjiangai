import { eq } from "drizzle-orm";
import { strFromU8, unzipSync } from "fflate";
import { getDb } from "../db";
import { documentChunks } from "../db/schema";

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
  if (!new Set(["txt", "md", "docx"]).has(extension)) {
    throw new Error("本关支持.docx、.txt和.md文件；PDF和扫描件将在OCR关接入");
  }
  if (file.size <= 0) throw new Error("上传文件为空");
  if (file.size > 8 * 1024 * 1024) throw new Error("单个试用文件不得超过8MB");
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const content = extension === "docx" ? extractDocx(bytes) : normalizeText(new TextDecoder("utf-8").decode(bytes));
  if (!content) throw new Error("没有从文件中识别到可用正文");
  if (content.length > MAX_EXTRACTED_CHARS) throw new Error("文件正文过长，请拆分后上传");
  return { buffer, content, extension };
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
