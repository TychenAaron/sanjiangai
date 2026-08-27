// 本脚本生成公文私有参考材料页面验收所需的实体虚构 xlsx、pptx 文件，并用当前解析器立即验证结果。
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as XLSX from "xlsx";
import { strToU8, zipSync } from "fflate";
import { parseWritingReference } from "../lib/writing-reference-parser.ts";

const fixturesDir = resolve("scripts/fixtures");
const xlsxPath = resolve(fixturesDir, "writing-reference-virtual.xlsx");
const xlsPath = resolve(fixturesDir, "writing-reference-virtual.xls");
const pptxPath = resolve(fixturesDir, "writing-reference-virtual.pptx");

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

// 生成至少一个工作表和三行完全虚构的本机测试文字，供页面上传时验证表格解析与行定位。
function createXlsx() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["本机测试字段", "本机测试内容"],
    ["本机测试事项", "本机测试私有参考材料"],
    ["本机测试状态", "本机测试待人工确认"],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, "本机测试工作表");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" });
}

// 使用同一份完全虚构表格生成旧版 XLS，验证管理员上传不会把旧 Excel 误判为待转换文件。
function createXls() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["本机测试旧版表格"], ["本机测试单元格一"], ["本机测试单元格二"]]), "本机测试旧表");
  return XLSX.write(workbook, { type: "array", bookType: "xls" });
}

// 生成两页最小 PPTX ZIP 结构；当前解析器只读取 slide XML，因此每页都放入可提取的虚构文字。
function createPptx() {
  return zipSync({
    "[Content_Types].xml": strToU8("<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"/>"),
    "ppt/slides/slide1.xml": strToU8("<p:sld xmlns:p=\"p\" xmlns:a=\"a\"><p:cSld><p:spTree><a:t>本机测试演示第1页</a:t></p:spTree></p:cSld></p:sld>"),
    "ppt/slides/slide2.xml": strToU8("<p:sld xmlns:p=\"p\" xmlns:a=\"a\"><p:cSld><p:spTree><a:t>本机测试演示第2页</a:t></p:spTree></p:cSld></p:sld>"),
  });
}

// 使用项目当前 writing-reference-parser 解析实体文件，确保文字和页/行定位可被上传链路实际提取。
async function verifyFixture(path: string, expectedStatus: string, expectedTexts: string[], expectedLocations: string[]) {
  const bytes = await readFile(path);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const result = await parseWritingReference({ fileName: path, buffer });
  assert(result.status === expectedStatus, `${path} 解析状态应为 ${expectedStatus}`);
  for (const text of expectedTexts) assert(result.text.includes(text), `${path} 未提取文字：${text}`);
  for (const location of expectedLocations) assert(result.locations.some((item) => item.includes(location)), `${path} 未提取定位：${location}`);
  return result;
}

await mkdir(fixturesDir, { recursive: true });
await writeFile(xlsxPath, new Uint8Array(createXlsx()));
await writeFile(xlsPath, new Uint8Array(createXls()));
await writeFile(pptxPath, createPptx());

const xlsx = await verifyFixture(xlsxPath, "parsed", ["本机测试字段", "本机测试私有参考材料", "本机测试待人工确认"], ["单元格A1", "单元格A2", "单元格A3"]);
const xls = await verifyFixture(xlsPath, "parsed", ["本机测试旧版表格", "本机测试单元格一", "本机测试单元格二"], ["单元格A1", "单元格A2", "单元格A3"]);
const pptx = await verifyFixture(pptxPath, "parsed", ["本机测试演示第1页", "本机测试演示第2页"], ["第1页", "第2页"]);

console.log(`PASS ${xlsxPath}：${xlsx.locations.length} 个表格定位`);
console.log(`PASS ${xlsPath}：${xls.locations.length} 个旧版表格定位`);
console.log(`PASS ${pptxPath}：${pptx.locations.length} 个页面定位`);
