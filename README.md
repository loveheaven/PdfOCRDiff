# PdfOCRDiff

PDF OCR 对比工具 — 将 PDF 通过 PaddleOCR 进行文字识别，并与 EPUB（他人识别结果）逐页对比，高亮差异。

## 架构

- **前端**: Tauri 2.0 + React + Vite + Tailwind CSS（Mac 原生客户端）
- **后端**: FastAPI + PaddleOCR + PyMuPDF（**仅负责 OCR**）
- **前端本地处理**: EPUB 解析（JSZip）+ 文本 Diff（diff-match-patch）

详见 [DESIGN.md](./DESIGN.md)。

## 快速开始

### 后端（仅 OCR 服务）

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

后端默认运行在 `http://localhost:8000`，可部署在本地或远程 GPU 服务器。

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

### 配置

点击右上角 ⚙ 设置按钮，可配置：
- **后端 OCR 地址**: 本地 `http://localhost:8000` 或远程 `http://your-gpu-server:8000`
- **中间列保存路径**
- **自动保存间隔**（默认 10 秒）

## 使用流程

1. **左栏**: 上传 PDF → 逐页显示大图，支持暂停/继续 OCR
2. **中栏**: 自动填入 OCR 文字，可编辑、自动保存、版本历史可回退
3. **右栏**: 选择 EPUB 文件 → 前端本地解析，显示参考文字
4. **Diff**: 中栏和右栏自动实时对比，差异用红框标注（前端本地计算，毫秒级）
5. 点击左栏某页图片 → 中栏自动滚动到对应文字位置
