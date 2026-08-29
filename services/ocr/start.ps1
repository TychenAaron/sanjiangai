# Project-bundled OCR service launcher for Windows. It creates an isolated venv and binds localhost by default.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = if ($env:OCR_PYTHON) { $env:OCR_PYTHON } else { "python" }
$versionText = (& $python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')").Trim()
$version = [version]$versionText
if ($version -lt [version]'3.9' -or $version -gt [version]'3.11') {
  throw "This locked PaddleOCR service requires Python 3.9 through 3.11. Detected Python $versionText. Set OCR_PYTHON to a compatible python.exe path."
}
Set-Location $root
$venvPython = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) { & $python -m venv .venv }
& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install -r requirements.txt
if (-not $env:OCR_HOST) { $env:OCR_HOST = "127.0.0.1" }
if (-not $env:OCR_PORT) { $env:OCR_PORT = "8765" }
& $venvPython -m uvicorn app:app --host $env:OCR_HOST --port $env:OCR_PORT
