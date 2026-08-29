"""三江集团项目内置 OCR 服务：仅在本机或受控服务器将 PDF/图片转换为结构化文本，不保存原件或全文日志。"""

from __future__ import annotations

import os
import shutil
import tempfile
import time
from pathlib import Path
from typing import Any, Optional

import fitz
from fastapi import FastAPI, File, HTTPException, UploadFile

APP_NAME = "sanjiang-paddleocr"
MAX_UPLOAD_BYTES = int(os.getenv("OCR_MAX_UPLOAD_BYTES", str(64 * 1024 * 1024)))
SUPPORTED_TYPES = {"application/pdf", "image/png", "image/jpeg", "image/tiff"}
SUPPORTED_SUFFIXES = {".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff"}

app = FastAPI(title="Sanjiang PaddleOCR Service", version="1.0.0")
_ocr: Optional[Any] = None
_structure: Optional[Any] = None
_load_error: Optional[str] = None


def load_engines() -> tuple[Any, Optional[Any]]:
    """延迟加载 PaddleOCR 和 PP-Structure；输入为空，输出识别器实例，失败仅保存脱敏异常类别。"""
    global _ocr, _structure, _load_error
    if _ocr is not None:
        return _ocr, _structure
    if _load_error:
        raise RuntimeError(_load_error)
    try:
        from paddleocr import PPStructure, PaddleOCR

        _ocr = PaddleOCR(use_angle_cls=True, lang="ch", show_log=False)
        # PP-Structure 是增强能力：初始化失败时保留文本 OCR，不阻断整个服务。
        try:
            _structure = PPStructure(show_log=False, lang="ch")
        except Exception:
            _structure = None
        return _ocr, _structure
    except Exception as error:
        _load_error = f"PaddleOCR 初始化失败：{type(error).__name__}"
        raise RuntimeError(_load_error) from error


def image_result(ocr: Any, image_path: str, page: int, structure: Optional[Any]) -> dict[str, Any]:
    """识别一页图片；输入本地临时路径和页码，输出不含原始图片的文字块、表格摘要与页面文本。"""
    result = ocr.ocr(image_path, cls=True)
    blocks: list[dict[str, Any]] = []
    text_lines: list[str] = []
    for line in result[0] if result else []:
        box, recognition = line
        text, confidence = recognition
        if not str(text).strip():
            continue
        text_lines.append(str(text).strip())
        blocks.append({"type": "text", "text": str(text).strip(), "confidence": round(float(confidence), 4), "box": box})
    tables: list[dict[str, Any]] = []
    if structure is not None:
        try:
            for item in structure(image_path):
                if item.get("type") == "table":
                    html = str(item.get("res", {}).get("html", "")).strip()
                    if html:
                        tables.append({"page": page, "html": html, "text": "表格：" + " ".join(text_lines)})
        except Exception:
            # 表格结构化属于增强项，不能因为单页 PP-Structure 异常而丢失已识别文字。
            pass
    return {"page": page, "text": "\n".join(text_lines), "blocks": blocks, "tables": tables}


@app.get("/health")
def health() -> dict[str, Any]:
    """服务就绪检查；尝试加载 OCR 引擎，返回实际就绪状态，不伪造模型可用。"""
    try:
        import paddleocr
        load_engines()
        return {"service": APP_NAME, "paddleocr": "loaded", "version": getattr(paddleocr, "__version__", "unknown"), "ready": True}
    except Exception:
        return {"service": APP_NAME, "paddleocr": "not_loaded", "version": None, "ready": False}


@app.post("/ocr")
async def ocr_document(file: UploadFile = File(...)) -> dict[str, Any]:
    """OCR 受控上传文件；输入 PDF/PNG/JPEG/TIFF，输出页面、文本和可选表格，不保留临时文件或全文日志。"""
    suffix = Path(file.filename or "upload").suffix.lower()
    if file.content_type not in SUPPORTED_TYPES and suffix not in SUPPORTED_SUFFIXES:
        raise HTTPException(status_code=415, detail="仅支持 PDF、PNG、JPG/JPEG、TIFF")
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if not data:
        raise HTTPException(status_code=400, detail="上传文件为空")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="文件超过 OCR 服务安全限制")
    try:
        ocr, structure = load_engines()
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail="OCR 引擎未就绪") from error

    started_at = time.perf_counter()
    temporary = Path(tempfile.mkdtemp(prefix="sanjiang-ocr-"))
    try:
        source = temporary / f"source{suffix or '.bin'}"
        source.write_bytes(data)
        images: list[Path] = []
        if suffix == ".pdf" or file.content_type == "application/pdf":
            pdf = fitz.open(stream=data, filetype="pdf")
            for page_index, pdf_page in enumerate(pdf):
                rendered = pdf_page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                image_path = temporary / f"page-{page_index + 1}.png"
                rendered.save(str(image_path))
                images.append(image_path)
            pdf.close()
        else:
            images.append(source)
        pages = [image_result(ocr, str(image), index + 1, structure) for index, image in enumerate(images)]
        tables = [table for page in pages for table in page["tables"]]
        return {"text": "\n\n".join(page["text"] for page in pages if page["text"]), "pages": [{"page": page["page"], "text": page["text"], "blocks": page["blocks"]} for page in pages], "tables": tables, "metadata": {"pageCount": len(pages), "engine": "PaddleOCR", "structure": "PP-Structure" if structure is not None else "text_only", "durationMs": round((time.perf_counter() - started_at) * 1000)}}
    finally:
        shutil.rmtree(temporary, ignore_errors=True)
