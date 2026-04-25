"""PDF → page images using PyMuPDF."""

from pathlib import Path
import base64
import fitz  # PyMuPDF


def get_page_count(pdf_path: str) -> int:
    doc = fitz.open(pdf_path)
    count = len(doc)
    doc.close()
    return count


def render_page_to_png(pdf_path: str, page_num: int, dpi: int = 200) -> bytes:
    """Render a single PDF page to PNG bytes."""
    doc = fitz.open(pdf_path)
    page = doc[page_num]
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat)
    png_bytes = pix.tobytes("png")
    doc.close()
    return png_bytes


def render_page_to_base64(pdf_path: str, page_num: int, dpi: int = 200) -> str:
    """Render a single PDF page to base64-encoded PNG data URI."""
    png_bytes = render_page_to_png(pdf_path, page_num, dpi)
    b64 = base64.b64encode(png_bytes).decode("ascii")
    return f"data:image/png;base64,{b64}"
