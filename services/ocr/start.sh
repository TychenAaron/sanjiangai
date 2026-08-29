#!/usr/bin/env sh
# 三江集团内置 OCR 服务 Linux 启动脚本：创建隔离环境、安装依赖并默认仅监听本机地址。
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PYTHON=${OCR_PYTHON:-python3}
VERSION=$($PYTHON -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
case "$VERSION" in 3.9|3.10|3.11) ;; *) echo "此锁定版 PaddleOCR 当前请使用 Python 3.9-3.11，检测到 $VERSION。可设置 OCR_PYTHON。" >&2; exit 1;; esac
cd "$ROOT"
[ -x .venv/bin/python ] || "$PYTHON" -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.txt
exec .venv/bin/python -m uvicorn app:app --host "${OCR_HOST:-127.0.0.1}" --port "${OCR_PORT:-8765}"
