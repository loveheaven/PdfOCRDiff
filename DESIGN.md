# PdfOCRDiff — 架构设计文档

## 项目概述

一个 PDF OCR 对比工具，用于将 PDF 通过 PaddleOCR 进行文字识别，并与已有的 EPUB（他人识别结果）进行逐页文本对比，高亮差异。

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| **前端框架** | Tauri 2.0 + React + Vite + TypeScript | Mac 原生客户端 (.app/.dmg) |
| **前端 UI** | Tailwind CSS | 三栏布局、响应式 |
| **前端 EPUB 解析** | JSZip + DOMParser | 浏览器本地解析 EPUB，无需后端 |
| **前端文本 Diff** | diff-match-patch (Google) | 浏览器本地逐字对比，毫秒级 |
| **后端** | FastAPI (Python) | 仅提供 OCR 服务（PDF→图片→文字） |
| **OCR 引擎** | PaddleOCR | 后端直接调用本机模型 |
| **PDF 处理** | PyMuPDF (fitz) | PDF 转页面图片 |

## 部署模型

后端只有一套代码。部署在哪台机器，就调用那台机器上的 PaddleOCR 模型。

- **本地部署**: 后端跑在本机，前端配置 `http://localhost:8000`
- **远程部署**: 后端跑在 GPU 服务器，前端配置 `http://gpu-server:8000`

前端只需在设置中配置后端 URL 即可切换。

```
前端 (Tauri App) ──HTTP/SSE──→ 后端 (FastAPI) ── OCR only
    │                              │
    ├─ JSZip (EPUB解析)            ├─ PaddleOCR (本机模型)
    └─ diff-match-patch (Diff)     └─ PyMuPDF (PDF→图片)
```

## 架构图

```
┌───────────────────────────────────────────────────────────┐
│  Tauri 2.0 Mac App                          [⚙ 设置]     │
│  React + Vite + Tailwind CSS                              │
│                                                           │
│  ┌──────────┐ ┌───────────────────┐ ┌──────────────────┐ │
│  │ 左栏 1/4  │ │ 中栏 3/8          │ │ 右栏 3/8          │ │
│  │           │ │                   │ │                  │ │
│  │ 上传 PDF  │ │ OCR 文字 (可编辑)  │ │ 上传 EPUB        │ │
│  │ 暂停/继续 │ │ 自动保存+版本历史  │ │ EPUB 文字显示     │ │
│  │ 3/10 进度 │ │ diff 高亮         │ │ diff 高亮        │ │
│  │           │ │ [编辑][保存][历史] │ │                  │ │
│  │ ┌──────┐  │ │                   │ │                  │ │
│  │ │ 大图 │  │ │ ──第1页──         │ │                  │ │
│  │ │ P.1  │  │ │ 文字内容...       │ │                  │ │
│  │ ├──────┤  │ │ ──第2页──         │ │                  │ │
│  │ │ 大图 │  │ │ 文字内容...       │ │                  │ │
│  │ │ P.2  │  │ │                   │ │                  │ │
│  │ └──────┘  │ │                   │ │                  │ │
│  └──────────┘ └───────────────────┘ └──────────────────┘ │
│                                                           │
│  设置弹窗: 后端URL / 保存路径 / 自动保存间隔               │
│  前端本地: EPUB解析(JSZip) + Diff(diff-match-patch)        │
└──────────┬────────────────────────────────────────────────┘
           │ POST /ocr/upload
           │ GET  /ocr/stream/{id}  (SSE 逐页推送)
           │ POST /ocr/pause/{id}
           │ POST /ocr/resume/{id}
           │ GET  /ocr/status/{id}
           ▼
┌──────────────────────────────────────────────────┐
│  FastAPI 后端 (仅 OCR)                            │
│                                                  │
│  /ocr/upload     → 接收 PDF，存储，返回任务 ID     │
│  /ocr/stream/id  → SSE 逐页返回 {page,image,text} │
│  /ocr/pause/id   → 暂停 OCR 任务                  │
│  /ocr/resume/id  → 继续 OCR 任务                  │
│  /ocr/status/id  → 查询任务进度和状态              │
│                                                  │
│  内部调用:                                        │
│  - PyMuPDF: PDF → 逐页 PNG 图片                   │
│  - PaddleOCR: 图片 → 文字识别结果                  │
└──────────────────────────────────────────────────┘
```

## API 设计

### POST `/ocr/upload`
- 上传 PDF 文件
- 返回: `{ "task_id": "uuid", "total_pages": 10 }`

### GET `/ocr/stream/{task_id}?start_page=0`
- SSE 流式推送，每识别完一页推送一条:
```json
{
  "page": 0,
  "total_pages": 10,
  "image": "data:image/png;base64,...",
  "text": "识别出的文字内容...",
  "boxes": [[x1,y1,x2,y2], ...],
  "scores": [0.99, ...]
}
```
- 暂停时推送: `{ "paused": true, "completed": 3, "total_pages": 10 }`
- 完成时推送: `{ "done": true, "completed": 10, "total_pages": 10 }`
- `start_page` 参数用于继续时跳过已完成页

### POST `/ocr/pause/{task_id}`
- 暂停 OCR 任务
- 返回: `{ "status": "paused", "completed": 3, "total_pages": 10 }`

### POST `/ocr/resume/{task_id}`
- 继续 OCR 任务
- 返回: `{ "status": "resumed", "completed": 3, "total_pages": 10 }`

### GET `/ocr/status/{task_id}`
- 查询任务状态
- 返回: `{ "task_id": "...", "total_pages": 10, "completed": 3, "completed_pages": [0,1,2], "paused": false, "done": false }`

## 前端本地处理

### EPUB 解析（前端 JSZip + DOMParser）
- 用户选择 EPUB 文件后，前端直接用 JSZip 解压，DOMParser 解析 HTML 内容
- 按 OPF spine 顺序提取各章节纯文本
- 无需上传到后端，离线也能用

### 文本 Diff（前端 diff-match-patch）
- 使用 Google diff-match-patch 库在浏览器本地计算逐字差异
- 编辑文本后毫秒级实时对比，无网络延迟
- 输出格式: equal / delete / insert / replace 四种类型

## 目录结构

```
PdfOCRDiff/
├── DESIGN.md              # 本文档
├── README.md
│
├── frontend/              # Tauri 2.0 + React + Vite
│   ├── src/
│   │   ├── App.tsx                # 主应用（三栏布局 + 状态串联）
│   │   ├── main.tsx               # React 入口
│   │   ├── index.css              # Tailwind v4 全局样式
│   │   ├── config.ts              # 配置（后端URL/保存路径/自动保存间隔）
│   │   ├── components/
│   │   │   ├── PdfPanel.tsx       # 左栏: PDF 上传 + 逐页大图列表
│   │   │   ├── EditablePanel.tsx  # 中栏: 可编辑 OCR 文字 + 版本历史 + diff 高亮
│   │   │   ├── DiffPanel.tsx      # 右栏: EPUB 文字 + diff 高亮（只读）
│   │   │   ├── EpubPanel.tsx      # 右栏顶部: EPUB 上传 + 章节选择
│   │   │   ├── SettingsBar.tsx    # 顶部栏（标题 + 设置按钮）
│   │   │   └── SettingsDialog.tsx # 设置弹窗（后端URL/保存路径/自动保存间隔）
│   │   └── hooks/
│   │       ├── useOcrStream.ts    # SSE 连接 + 暂停/继续
│   │       ├── useEpub.ts         # EPUB 本地解析 (JSZip)
│   │       ├── useDiff.ts         # 本地文本对比 (diff-match-patch)
│   │       └── useEditorStore.ts  # 可编辑文本 + 自动保存 + 版本历史
│   ├── src-tauri/                 # Tauri 原生层
│   │   ├── tauri.conf.json
│   │   ├── Cargo.toml
│   │   └── src/
│   │       └── main.rs
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
│
├── backend/               # FastAPI (仅 OCR)
│   ├── main.py            # FastAPI 应用入口（含 task 状态管理）
│   ├── ocr_service.py     # PaddleOCR 封装
│   ├── pdf_service.py     # PyMuPDF: PDF → 图片
│   ├── config.py          # 配置
│   └── requirements.txt
│
└── .gitignore
```

## 核心流程

### OCR 流程
1. 用户在左栏上传 PDF
2. 前端 POST `/ocr/upload`，获得 `task_id` 和 `total_pages`
3. 前端连接 SSE `/ocr/stream/{task_id}`
4. 后端逐页: PDF→图片→PaddleOCR→文字，通过 SSE 推送
5. 前端收到一页: 左栏显示缩略图，中栏显示文字，按 page 号保存到 Map
6. **暂停**: 用户点暂停 → 前端 POST `/ocr/pause/{task_id}` → 后端停止处理未完成页
7. **继续**: 用户点继续 → 前端 POST `/ocr/resume/{task_id}` → 重连 SSE，从已完成页数后继续
8. 每页 OCR 结果同时持久化到磁盘 (`{upload_dir}/{task_id}/results/page_NNNN.json`)
9. 按钮状态: `上传 PDF` → `暂停`(识别中) → `继续`(已暂停) → `重新上传`(完成)
10. 进度显示: 标题旁显示 `已完成页/总页数`，进度条颜色随状态变化

### 左栏交互
- 所有已识别的页面以完整大图纵向排列，一页一页展示
- 每页图片上方有页码分隔标签，选中页蓝色左边框 + 蓝色标签高亮
- 点击某页图片 → 中栏自动滚动到该页对应文字位置

### 中栏编辑 + 版本历史
1. OCR 结果自动填入中栏，每页文字可编辑
2. **自动保存**: 每 N 秒（可配置，默认 10s）自动保存所有脏页，版本号 +1
3. **手动保存**: 点击"保存"按钮立即保存当前页
4. **版本历史**: 右上角"历史"按钮弹出版本列表（按时间倒序），点击可恢复到该版本
5. **编辑/预览切换**: "编辑"按钮切换为 textarea 编辑模式，"预览"按钮切换回 diff 高亮视图
6. 预览模式下所有页面文字上下排列，带页码分隔符

### EPUB 流程（前端本地）
1. 用户在右栏选择 EPUB 文件
2. 前端用 JSZip 解压 → DOMParser 解析 HTML → 提取纯文本
3. 按 OPF spine 顺序分章节展示在右栏
4. 无需后端参与，离线可用

### Diff 流程（前端本地）
1. 当某页 OCR 文字（可能已编辑）和对应 EPUB 文字都就绪时
2. 前端用 diff-match-patch 实时计算逐字差异
3. 中栏和右栏同时用红框/红色背景标注差异文字
4. 编辑文字后自动重新 diff，毫秒级响应

### 设置
- 右上角 ⚙ 按钮打开设置弹窗
- 可配置项:
  - 后端 OCR 服务地址（本地或远程）
  - 项目保存路径（默认 ~/Downloads）
  - 自动保存间隔（秒）
- 所有设置持久化到 localStorage

### 项目保存格式（.ocrdiff 文件夹）
OCR 过程中，实时将结果保存到 `~/Downloads/<文件名>.ocrdiff/` 文件夹：

```
example.ocrdiff/
├── manifest.json   # 元数据 + 原始 OCR + 编辑历史
└── pages/
    ├── page_0000.png
    └── ...
```

`manifest.json` 结构：
```json
{
  "ocrdiff_version": 1,
  "pdf_name": "example.pdf",
  "dpi": 200,
  "source": "remote_stream",
  "total_pages": 10,
  "created_at": "2026-04-26T...",
  "base": {
    "pages": [
      { "page": 0, "image": "pages/page_0000.png", "text": "原始文字", "boxes": [], "scores": [] }
    ]
  },
  "edits": [
    { "page": 2, "text": "修改后文字", "version": 2, "modified_at": "2026-04-26T03:00:00" }
  ]
}
```

- `base.pages`：原始 OCR 结果，图片路径不变
- `edits`：append-only 编辑历史数组，每次保存 push 新记录，不改历史
- 加载时：取 `base.text`，按 `edits` 里该页最新 text 覆盖
- 自动保存：每 10 秒将 dirty 的 edits 写入 manifest.json
- 导出：打包为 `.ocrdiff.zip` 供分享

## 开发计划

1. **Phase 1** ✅: 搭建 Tauri 2.0 + React 前端骨架 + 三栏布局
2. **Phase 2** ✅: 搭建 FastAPI 后端 + OCR 服务
3. **Phase 3** ✅: 前后端联调 (SSE + Diff 高亮 + 暂停/继续)
4. **Phase 4** ✅: 中栏可编辑 + 自动保存 + 版本历史 + 设置弹窗
5. **Phase 5** ✅: EPUB 解析 + Diff 移到前端本地（后端仅 OCR）
6. **Phase 6** ✅: 打包为 Mac 应用 (.dmg)
