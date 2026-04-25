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
构建产物位于 `frontend/src-tauri/target/release/bundle/`：
- **.app**: `frontend.app` (位于 `bundle/macos/` 目录，可直接拖入 Applications 文件夹)
- **.dmg**: 需要安装 `create-dmg` (`brew install create-dmg`)，运行 `pnpm tauri build` 会自动生成磁盘映像


### 配置

点击右上角 ⚙ 设置按钮，可配置：
- **后端 OCR 地址**: 本地 `http://localhost:8000` 或远程 `http://your-gpu-server:8000`
- **中间列保存路径**
- **自动保存间隔**（默认 10 秒）

## 使用流程

1. **左栏**: 上传 PDF → 逐页显示大图，支持暂停/继续 OCR
2. **中栏**: 自动填入 OCR 文字，可编辑、自动保存（每10秒）、版本历史可回退
3. **右栏**: 选择 EPUB 文件 → 前端本地解析，显示参考文字
4. **Diff**: 中栏和右栏自动实时对比，差异用红框标注（前端本地计算，毫秒级）
5. 点击左栏某页图片 → 中栏自动滚动到对应文字位置

## 项目保存

OCR 过程中，图片和编辑结果实时保存到本地文件夹（默认 `~/Downloads/<文件名>.ocrdiff/`）：

- **图片**：`pages/page_XXXX.png` — 随 OCR 进度逐页写入，不会因网络中断丢失
- **元数据**：`manifest.json` — 包含原始 OCR 结果和所有编辑历史（append-only）
- **版本历史**：每次编辑产生一条记录，可随时回退到任意历史版本
- **自动保存**：每 10 秒将 pending 的编辑写入 manifest.json
- **导出**：点击右上角"导出识别结果"，将项目打包为 `.ocrdiff.zip` 用于分享

`.ocrdiff` 项目文件夹支持直接通过"打开文件夹"按钮重新加载，继续之前的编辑。

## 离线使用

若远程服务器无法直接访问（例如仅能 SSH 登录），可使用离线工作流：

1. 在远程服务器上安装依赖：
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

2. 使用 CLI 工具处理 PDF，生成 `.ocrdiff` 文件：
   ```bash
   python ocr_cli.py document.pdf --lang ch --engine paddle_static --device gpu:0
   ```

3. 将生成的 `.ocrdiff` 文件下载到本机，在前端点击右上角的“打开 .ocrdiff”按钮加载。

`.ocrdiff` 文件是一个 ZIP 存档，包含所有页面图片和 OCR 结果 JSON，无需连接后端即可浏览和对比。


## 故障排除

- **OCR 识别速度慢**: 确保后端运行在 GPU 服务器上，且 `--device` 参数正确。
- **EPUB 解析失败**: 确保 EPUB 文件符合标准（EPUB 2 或 3）。
- **前端无法连接后端**: 在设置中检查后端地址，并点击“测试连接”按钮。
- **构建失败**: 检查 Rust 工具链是否安装 (`rustc --version`)，并确保 Xcode Command Line Tools 已安装。
