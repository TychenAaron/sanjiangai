import { eq } from "drizzle-orm";
import { strFromU8, unzipSync } from "fflate";
import { getDb } from "../db";
import { documentChunks } from "../db/schema";
import { parseWritingReference } from "./writing-reference-parser";

const MAX_EXTRACTED_CHARS = 600_000;
const CHUNK_MAX_CHARS = 520;
const LONG_PARAGRAPH_PIECE_CHARS = 420;

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
  // 不设业务固定大小阈值；运行环境仍可能实施独立请求体保护，超限会在进入解析前被拒绝。
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
  let latestHeading = "";
  for (const paragraph of paragraphs) {
    // 记录最近章节标题并写入后续切片，让标题语义与跨边界正文一起进入关键词和向量检索。
    const heading = paragraph.match(/(?:[一二三四五六七八九十]+、|\d+(?:\.\d+)*\s+)[^。；\n]{2,48}/u)?.[0]?.trim();
    if (heading) latestHeading = heading;
    // 长段落按模型上下文摘要上限切分，避免命中的制度事实落在 chunk 摘要之外而无法进入 grounded answer。
    const pieces = paragraph.length > CHUNK_MAX_CHARS ? paragraph.match(new RegExp(`[\\s\\S]{1,${LONG_PARAGRAPH_PIECE_CHARS}}`, "g")) || [] : [paragraph];
    for (const piece of pieces) {
      if (current && current.length + piece.length + 1 > CHUNK_MAX_CHARS) {
        chunks.push(current);
        current = `${latestHeading ? `章节：${latestHeading}\n` : ""}${current.slice(-100)}\n${piece}`;
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
    const rows = chunks.map((chunk, chunkIndex) => ({
      id: crypto.randomUUID(), documentId, versionId, chunkIndex, content: chunk, charCount: chunk.length, createdAt: now,
    }));
    // D1 对单条批量 SQL 的绑定参数数量有限。输入为同一 document version 的完整分段，输出为逐批写入的 chunks；避免长文重建时中途失败。
    for (let offset = 0; offset < rows.length; offset += 12) await db.insert(documentChunks).values(rows.slice(offset, offset + 12));
  }
  return chunks.length;
}

export function safeStorageName(value: string) {
  return value.normalize("NFKC").replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "document";
}
