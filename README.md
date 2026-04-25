# PdfOCRDiff

PDF OCR 对比工具 — 将 PDF 通过 PaddleOCR 进行文字识别，并与 EPUB（他人识别结果）逐页对比，高亮差异。

## 架构

- **前端**: Tauri 2.0 + React + Vite + Tailwind CSS（Mac 原生客户端）
- **后端**: FastAPI + PaddleOCR + PyMuPDF + ebooklib

详见 [DESIGN.md](./DESIGN.md)。

## 快速开始

### 后端

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 启动
python main.py
# 或
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

后端默认运行在 `http://localhost:8000`。

### 前端

```bash
cd frontend
pnpm install

# 开发模式 (浏览器)
pnpm dev

# 开发模式 (Tauri 桌面窗口)
pnpm tauri dev

# 构建 Mac 应用
pnpm tauri build
```

### 配置后端地址

在应用顶部栏可以配置后端 URL：
- 本地: `http://localhost:8000`
- 远程: `http://your-gpu-server:8000`

## 使用流程

1. 左栏上传 PDF → 点击开始 OCR → 逐页显示图像和识别文字
2. 右栏上传 EPUB → 显示参考文字
3. 中栏自动对比 OCR 结果和 EPUB 文字，差异用红框标注
