"""FastAPI backend for PdfOCRDiff – OCR only."""

import asyncio
import json
import os
import uuid
from pathlib import Path
from typing import Dict

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

import config
from pdf_service import get_page_count, render_page_to_png, render_page_to_base64
from ocr_service import ocr_image_bytes

app = FastAPI(title="PdfOCRDiff Backend", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs(config.UPLOAD_DIR, exist_ok=True)


# ---------- Task state management ----------

class TaskState:
    """Tracks OCR task progress, pause/resume, and per-page results."""

    def __init__(self, task_id: str, pdf_path: str, total_pages: int):
        self.task_id = task_id
        self.pdf_path = pdf_path
        self.total_pages = total_pages
        self.completed_pages: set[int] = set()
        self.results: Dict[int, dict] = {}  # page_num -> result dict
        self.paused = False
        self.pause_event = asyncio.Event()
        self.pause_event.set()  # not paused initially
        self.cancelled = False

    @property
    def next_page(self) -> int | None:
        """Return the next page to process, or None if all done."""
        for p in range(self.total_pages):
            if p not in self.completed_pages:
                return p
        return None

    @property
    def is_done(self) -> bool:
        return len(self.completed_pages) >= self.total_pages


# In-memory task registry
tasks: Dict[str, TaskState] = {}


def save_page_result(task_id: str, page_num: int, result: dict):
    """Persist a single page's OCR result to disk as JSON."""
    task_dir = Path(config.UPLOAD_DIR) / task_id / "results"
    task_dir.mkdir(parents=True, exist_ok=True)
    result_path = task_dir / f"page_{page_num:04d}.json"
    result_path.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")


def load_page_results(task_id: str) -> Dict[int, dict]:
    """Load all persisted page results from disk."""
    results_dir = Path(config.UPLOAD_DIR) / task_id / "results"
    results: Dict[int, dict] = {}
    if results_dir.exists():
        for f in sorted(results_dir.glob("page_*.json")):
            data = json.loads(f.read_text(encoding="utf-8"))
            results[data["page"]] = data
    return results


# ---------- PDF / OCR ----------

@app.post("/ocr/upload")
async def ocr_upload(file: UploadFile = File(...)):
    """Upload a PDF and return a task_id for streaming OCR results."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted")

    task_id = str(uuid.uuid4())
    task_dir = Path(config.UPLOAD_DIR) / task_id
    task_dir.mkdir(parents=True, exist_ok=True)

    pdf_path = task_dir / "input.pdf"
    content = await file.read()
    pdf_path.write_bytes(content)

    total_pages = get_page_count(str(pdf_path))

    # Create task state
    state = TaskState(task_id, str(pdf_path), total_pages)
    tasks[task_id] = state

    return {"task_id": task_id, "total_pages": total_pages}


@app.get("/ocr/stream/{task_id}")
async def ocr_stream(task_id: str, start_page: int = 0):
    """SSE endpoint – streams OCR results page by page, respecting pause/resume."""
    if task_id not in tasks:
        raise HTTPException(404, "Task not found")

    state = tasks[task_id]
    state.paused = False
    state.pause_event.set()
    state.cancelled = False

    async def generate():
        for page_num in range(start_page, state.total_pages):
            # Check if cancelled (client disconnected or new stream started)
            if state.cancelled:
                break

            # Wait if paused
            if state.paused:
                yield f"data: {json.dumps({'paused': True, 'completed': len(state.completed_pages), 'total_pages': state.total_pages})}\n\n"
                await state.pause_event.wait()
                if state.cancelled:
                    break

            # Skip already-completed pages
            if page_num in state.completed_pages:
                continue

            # Run OCR (in thread pool to not block event loop)
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, _process_page, state.pdf_path, page_num, state.total_pages)

            # Save result
            state.results[page_num] = result
            state.completed_pages.add(page_num)
            save_page_result(task_id, page_num, result)

            yield f"data: {json.dumps(result, ensure_ascii=False)}\n\n"

        if not state.cancelled and state.is_done:
            yield f"data: {json.dumps({'done': True, 'completed': len(state.completed_pages), 'total_pages': state.total_pages})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


def _process_page(pdf_path: str, page_num: int, total_pages: int) -> dict:
    """Process a single PDF page: render + OCR. Runs in thread pool."""
    image_b64 = render_page_to_base64(pdf_path, page_num)
    png_bytes = render_page_to_png(pdf_path, page_num)
    boxes, texts, scores = ocr_image_bytes(png_bytes)
    full_text = "\n".join(texts)

    return {
        "page": page_num,
        "total_pages": total_pages,
        "image": image_b64,
        "text": full_text,
        "boxes": boxes,
        "scores": scores,
    }


@app.post("/ocr/pause/{task_id}")
async def ocr_pause(task_id: str):
    """Pause an ongoing OCR task."""
    if task_id not in tasks:
        raise HTTPException(404, "Task not found")

    state = tasks[task_id]
    state.paused = True
    state.pause_event.clear()
    return {
        "status": "paused",
        "completed": len(state.completed_pages),
        "total_pages": state.total_pages,
    }


@app.post("/ocr/resume/{task_id}")
async def ocr_resume(task_id: str):
    """Resume a paused OCR task."""
    if task_id not in tasks:
        raise HTTPException(404, "Task not found")

    state = tasks[task_id]
    state.paused = False
    state.pause_event.set()
    return {
        "status": "resumed",
        "completed": len(state.completed_pages),
        "total_pages": state.total_pages,
    }


@app.get("/ocr/status/{task_id}")
async def ocr_status(task_id: str):
    """Get current OCR task status."""
    if task_id not in tasks:
        raise HTTPException(404, "Task not found")

    state = tasks[task_id]
    return {
        "task_id": task_id,
        "total_pages": state.total_pages,
        "completed": len(state.completed_pages),
        "completed_pages": sorted(state.completed_pages),
        "paused": state.paused,
        "done": state.is_done,
    }


# ---------- Health ----------

@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=config.HOST, port=config.PORT)
