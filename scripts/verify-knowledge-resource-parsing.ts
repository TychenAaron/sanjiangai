// 本脚本用 scripts/fixtures 的完全虚构 Office 文件验证知识资源与私有参考共用的解析结果，不访问服务、D1、R2 或模型。
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseWritingReference } from "../lib/writing-reference-parser.ts";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function parseFixture(name: string, type: string) { const bytes = await readFile(resolve("scripts/fixtures", name)); const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer; return parseWritingReference({ fileName: name, mimeType: type, buffer }); }

// 输入为虚构 XLS/XLSX/PPTX/PPT 文件；输出检查知识资源上传前的文本、定位与待转换状态。
for (const [name, type, location] of [["writing-reference-virtual.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "单元格A1"], ["writing-reference-virtual.xls", "application/vnd.ms-excel", "单元格A1"], ["writing-reference-virtual.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "第1页"]] as const) {
  const result = await parseFixture(name, type);
  assert(result.status === "parsed" && result.text.includes(location), `${name} 应提取可定位文本`);
  console.log(`PASS ${name}：${location}`);
}
const legacyPpt = await parseWritingReference({ fileName: "virtual-legacy.ppt", buffer: new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]).buffer });
assert(legacyPpt.status === "pending_conversion" && !legacyPpt.text, ".ppt 必须待转换且没有伪造正文");
const ingestion = await readFile(new URL("../lib/ingestion.ts", import.meta.url), "utf8");
assert(ingestion.includes("文件扩展名与 Office 文件格式不匹配") && ingestion.includes("isCompoundOffice"), "上传前必须验证 Office 二进制容器");
console.log("PASS 旧版 PPT 待转换；伪造 XLSX 已拒绝。");
