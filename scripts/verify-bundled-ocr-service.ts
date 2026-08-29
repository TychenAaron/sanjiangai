// 验证项目内 OCR 服务交付契约：只读取源码和虚构 OCR 响应，不启动 Python、不访问网络、不读取真实资料。
import { readFile, stat } from "node:fs/promises";
import { parseOcrResponse } from "../lib/document-parser.ts";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

/** 检查 OCR 服务文件、接口和统一解析约定，输入为仓库源码，输出为可重复的离线验收结论。 */
async function main() {
  for (const file of ["services/ocr/app.py", "services/ocr/requirements.txt", "services/ocr/README.md", "services/ocr/start.ps1", "services/ocr/start.sh", "services/ocr/config.example.env", "lib/ocr-client.ts"]) {
    const info = await stat(file); assert(info.isFile(), `缺少 OCR 交付文件：${file}`);
  }
  const service = await readFile("services/ocr/app.py", "utf8");
  for (const expected of ["@app.get(\"/health\")", "@app.post(\"/ocr\")", "PaddleOCR", "PPStructure", "fitz", "shutil.rmtree"]) assert(service.includes(expected), `OCR 服务缺少受控能力：${expected}`);
  assert(!/print\s*\(/.test(service), "OCR 服务不得向日志输出识别全文");
  const launcher = await readFile("services/ocr/start.ps1", "utf8"); assert(launcher.includes("127.0.0.1"), "Windows 启动脚本必须默认仅监听本机地址");
  const result = parseOcrResponse("虚构扫描制度.pdf", { pages: [{ page: 1, text: "虚构中文制度\n正常班上午八点三十分", blocks: [{ text: "虚构中文制度" }] }], tables: [{ page: 1, text: "表格：岗位 / 时间\n正常班 / 08:30" }] });
  assert(result.status === "parsed" && result.pages[0]?.page === 1 && result.structuredBlocks.some((block) => block.type === "table"), "OCR 响应未正确进入统一解析结构");
  const client = await readFile("lib/ocr-client.ts", "utf8");
  for (const expected of ["resolveOcrRuntime", "AbortController", "parseOcrResponse", "FormData"]) assert(client.includes(expected), `主应用 OCR 客户端缺少：${expected}`);
  console.log("PASS 项目内 OCR 服务契约：健康检查、受控上传、PDF 页渲染、PaddleOCR/PP-Structure、临时文件清理及统一解析调用链已就绪。");
}

void main();
