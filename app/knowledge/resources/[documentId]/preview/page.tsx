"use client";

// 正式知识资源在线预览页：只读取受 ACL 保护的预览 API，不接触 R2 key、RAG 或资料生命周期。
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type PreviewData = {
  document: { id: string; title: string; fileName: string | null; mimeType: string | null; createdAt: string; createdBy: string; securityLevel: string; resourceStatus: string; lifecycleStatus: string; parseStatus: string; datasetName: string | null };
  version: { id: string; versionNo: number; createdAt: string };
  fileUrl: string | null;
  preview: { kind: "pdf" | "text" | "markdown" | "document" | "spreadsheet" | "slides" | "pending"; message?: string; text?: string; sheets?: Array<{ name: string; rows: string[][] }>; slides?: Array<{ page: number; text: string }> };
};

// 说明：将普通 Markdown 行安全显示为标题、列表或段落。输入只来自已通过 ACL 的 API 文本，输出 React 节点，不执行 HTML。
function MarkdownText({ text }: { text: string }) {
  return <div className="resource-preview-text">{text.split(/\r?\n/).map((line, index) => line.startsWith("### ") ? <h3 key={index}>{line.slice(4)}</h3> : line.startsWith("## ") ? <h2 key={index}>{line.slice(3)}</h2> : line.startsWith("# ") ? <h1 key={index}>{line.slice(2)}</h1> : /^[-*]\s+/.test(line) ? <li key={index}>{line.replace(/^[-*]\s+/, "")}</li> : <p key={index}>{line || "　"}</p>)}</div>;
}

// 说明：读取当前 URL 的 documentId 并请求受控预览。输入是路由参数，输出是全文预览或简短权限/解析提示；浏览器不获得底层存储地址。
export default function ResourcePreviewPage() {
  const params = useParams<{ documentId: string }>();
  const documentId = Array.isArray(params.documentId) ? params.documentId[0] : params.documentId;
  const [data, setData] = useState<PreviewData | null>(null);
  const [error, setError] = useState("");
  const [sheetIndex, setSheetIndex] = useState(0);
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    if (!documentId) return;
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/preview`, { cache: "no-store" });
        const result = await response.json() as PreviewData & { error?: string };
        if (!response.ok) throw new Error(result.error || "读取文件预览失败");
        if (active) { setData(result); setSheetIndex(0); setSlideIndex(0); }
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "读取文件预览失败"); }
    })();
    return () => { active = false; };
  }, [documentId]);

  if (error) return <main className="resource-preview-page"><Link href="/">返回知识资源</Link><section className="resource-preview-card"><h1>无法预览该资料</h1><p>{error}</p></section></main>;
  if (!data) return <main className="resource-preview-page"><section className="resource-preview-card"><p>正在读取受权限保护的文件预览…</p></section></main>;
  const { document, version, preview, fileUrl } = data;
  const sheets = preview.sheets || []; const slides = preview.slides || [];
  const sheet = sheets[Math.min(sheetIndex, Math.max(0, sheets.length - 1))]; const slide = slides[Math.min(slideIndex, Math.max(0, slides.length - 1))];
  return <main className="resource-preview-page"><header className="resource-preview-header"><div><Link href="/">← 返回知识资源</Link><h1>{document.fileName || document.title}</h1><p>文件全文预览</p></div>{fileUrl && <a className="resource-download" href={`${fileUrl}?download=1`}>下载原文件</a>}</header>
    <section className="resource-preview-card resource-preview-meta"><span>文件类型：{document.fileName?.split(".").pop()?.toUpperCase() || document.mimeType || "资料文件"}</span><span>上传时间：{document.createdAt}</span><span>上传人：{document.createdBy}</span><span>Document ID：{document.id}</span><span>Version ID：{version.id}</span><span>资料集：{document.datasetName || "未归入资料集"}</span><span>密级：{document.securityLevel}</span><span>状态：{document.resourceStatus} / {document.lifecycleStatus}</span><span>解析：{document.parseStatus}</span></section>
    <section className="resource-preview-card resource-preview-content"><h2>文件全文预览</h2>
      {preview.kind === "pdf" && fileUrl && (
        <iframe className="resource-pdf-frame" title={`${document.title} PDF 预览`} src={fileUrl}/>
      )}
      {preview.kind === "pending" && <p className="resource-preview-pending">{preview.message}</p>}
      {(preview.kind === "text" || preview.kind === "document") && <pre className="resource-preview-plain">{preview.text}</pre>}
      {preview.kind === "markdown" && <MarkdownText text={preview.text || ""}/>}
      {preview.kind === "spreadsheet" && <div className="resource-sheet-preview"><nav>{sheets.map((item, index) => <button className={index === sheetIndex ? "active" : ""} onClick={() => setSheetIndex(index)} key={item.name}>{item.name}</button>)}</nav>{sheet && <div className="resource-sheet-scroll"><table><tbody>{sheet.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, columnIndex) => <td key={columnIndex}>{cell}</td>)}</tr>)}</tbody></table></div>}</div>}
      {preview.kind === "slides" && slide && <div className="resource-slide-preview"><nav><button disabled={slideIndex === 0} onClick={() => setSlideIndex(slideIndex - 1)}>上一页</button><span>第 {slide.page} 页 / 共 {slides.length} 页</span><button disabled={slideIndex >= slides.length - 1} onClick={() => setSlideIndex(slideIndex + 1)}>下一页</button></nav><article><h3>第 {slide.page} 页</h3><p>{slide.text}</p></article></div>}
    </section>
  </main>;
}
