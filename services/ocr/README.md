# 三江集团内置 PaddleOCR 服务

该服务随项目交付，用于中文扫描 PDF 和图片的文字、版面及基础表格识别。服务默认只监听 `127.0.0.1:8765`，不会保存上传原件，也不会把全文写入日志。

## Windows CPU

需要 **Python 3.9-3.11**。在 PowerShell 执行：

```powershell
cd E:\SanjiangAI\services\ocr
$env:OCR_PYTHON = "C:\\Python311\\python.exe"
.\start.ps1
```

将 `OCR_PYTHON` 替换为兼容 Python 的实际 `python.exe` 路径；没有设置时脚本使用 `python`。首次启动会建立 `.venv` 并安装锁定的 FastAPI、PyMuPDF、PaddleOCR 与 Windows/Linux CPU 版 `paddlepaddle`。首次启动会下载模型权重。

## Linux GPU

同样使用 Python 3.9-3.11：

```sh
cd /path/to/SanjiangAI/services/ocr
OCR_PYTHON=python3.11 ./start.sh
```

按服务器 CUDA 版本在 `.venv` 用匹配的 `paddlepaddle-gpu` 替换 CPU 包后再运行脚本。GPU 运行时不提交 Git。

## 管理后台配置

治理后台“模型与算力 / 模型接入配置”的 **OCR（项目内 PaddleOCR 服务）** 使用：

- Base URL：`http://127.0.0.1:8765`
- OCR Endpoint：`/ocr`
- Timeout：建议扫描 PDF 使用 `60000`
- Enabled：启用

D1 管理配置优先于环境变量；没有 D1 配置时，主应用默认尝试上述本地地址。可用环境变量为 `OCR_BASE_URL`、`OCR_ENDPOINT`、`OCR_TIMEOUT_MS`、`OCR_ENABLED` 和可选的 `OCR_API_KEY`。

## 接口

- `GET /health`：返回服务、PaddleOCR 可用状态、版本和 `ready`。
- `POST /ocr`：multipart 字段名为 `file`，支持 PDF、PNG、JPG/JPEG、TIFF，返回 `text`、`pages`、`tables` 与脱敏元数据。

模型首次加载可自动下载权重。内网离线环境可预置 Paddle 缓存，并通过 `PADDLE_PDX_CACHE_HOME` 指定模型缓存目录；缓存目录必须保持在 Git 忽略范围内。
