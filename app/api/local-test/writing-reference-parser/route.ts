import * as XLSX from "xlsx";
import { strToU8, zipSync } from "fflate";
import { isLocalDevelopmentRequest } from "../../../../lib/access";
import { parseWritingReference } from "../../../../lib/writing-reference-parser";

export const runtime = "edge";

function toArrayBuffer(bytes: Uint8Array<ArrayBufferLike>) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

// 说明：该接口只在 development + localhost 中构造虚构内存样例测试解析器，不读取真实文件，不写数据库或公共知识库。
export async function GET(request: Request) {
  if (!isLocalDevelopmentRequest(request)) return Response.json({ error: "本机测试接口不可用" }, { status: 404 });

  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([["虚构工作表"], ["事项", "虚构内容"], ["测试", "本机解析"]]);
  XLSX.utils.book_append_sheet(book, sheet, "虚构工作表");
  const xlsx = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const docx = toArrayBuffer(zipSync({ "word/document.xml": strToU8("<w:document><w:body><w:p><w:t>本机虚构 Word 正文</w:t></w:p></w:body></w:document>") }));
  const pptx = toArrayBuffer(zipSync({
    "ppt/slides/slide1.xml": strToU8("<p:sld><p:cSld><a:t>本机虚构演示第一页</a:t></p:cSld></p:sld>"),
    "ppt/slides/slide2.xml": strToU8("<p:sld><p:cSld><a:t>本机虚构演示第二页</a:t></p:cSld></p:sld>"),
  }));

  const textBuffer = new TextEncoder().encode("本机虚构文本\n第二段").buffer as ArrayBuffer;
  const samples = await Promise.all([
    parseWritingReference({ fileName: "virtual.txt", buffer: textBuffer }),
    parseWritingReference({ fileName: "virtual.docx", buffer: docx }),
    parseWritingReference({ fileName: "virtual.xlsx", buffer: xlsx }),
    parseWritingReference({ fileName: "virtual.pptx", buffer: pptx }),
    parseWritingReference({ fileName: "virtual.doc", buffer: new ArrayBuffer(0) }),
    parseWritingReference({ fileName: "virtual.ppt", buffer: new ArrayBuffer(0) }),
  ]);

  return Response.json({
    samples: samples.map((sample) => ({
      format: sample.format,
      status: sample.status,
      preview: sample.text.slice(0, 120),
      locationCount: sample.locations.length,
      reason: sample.reason,
    })),
  });
}
