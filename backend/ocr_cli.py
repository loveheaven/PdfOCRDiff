#!/usr/bin/env python3
"""
ocr_cli.py — Offline CLI for PaddleOCR processing.

Usage:
    python ocr_cli.py input.pdf                      # → input.ocrdiff.zip
    python ocr_cli.py input.pdf -o result.ocrdiff    # → result.ocrdiff.zip
    python ocr_cli.py input.pdf --lang ch --device gpu:0
    python ocr_cli.py input.pdf --pages 0-9          # only first 10 pages
    python ocr_cli.py input.pdf --dpi 300

Output:
    A .ocrdiff.zip file (ZIP archive) containing:
        manifest.json          — metadata + per-page OCR results
        pages/page_0000.png    — page image
        pages/page_0001.png    — page image
        ...

    The manifest.json structure follows the .ocrdiff v1 format:
    {
        "ocrdiff_version": 1,
        "pdf_name": "input.pdf",
        "dpi": 200,
        "source": "local_cli",
        "total_pages": 10,
        "created_at": "2026-04-26T02:00:00",
        "base": {
            "pages": [
                {
                    "page": 0,
                    "image": "pages/page_0000.png",
                    "text": "recognized text...",
                    "boxes": [[[x1,y1],[x2,y2],[x3,y3],[x4,y4]], ...],
                    "scores": [0.99, ...]
                },
                ...
            ]
        },
        "edits": []
    }
"""

import argparse
import json
import os
import sys
import time
import zipfile
from datetime import datetime
from pathlib import Path

import fitz  # PyMuPDF
import numpy as np
from PIL import Image
import io


def create_ocr_engine(lang: str, engine: str, device: str, structure = True):
    if structure:
        from paddleocr import PPStructureV3
        return PPStructureV3(
            lang=lang,
            engine=engine,
            use_formula_recognition=False,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
        )
    """Create PaddleOCR instance."""
    from paddleocr import PaddleOCR
    return PaddleOCR(
        lang=lang,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        # engine and device are ignored here; the classic ocr() API
        # routes to the appropriate backend automatically.
        engine=engine,
    )


def render_page(doc, page_num: int, dpi: int) -> bytes:
    """Render a PDF page to PNG bytes."""
    page = doc[page_num]
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat)
    return pix.tobytes("png")


def ocr_png_bytes(ocr, png_bytes: bytes, page_num):
    """Run OCR on PNG bytes, return (boxes, texts, scores)."""
    image = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    img_array = np.array(image)

    # Use ocr() method which returns [(box, (text, score)), ...]
    # This avoids the PIR bug in predict() API
    results = ocr.predict(img_array)
    # print(results)

    boxes, texts, scores, markdown_texts, page_continuation_flags = [], [], [], "", []
    if results:
        for line in results:
            # line.save_to_json(f'{page_num}.json')
            markdown_texts = line.markdown['markdown_texts']
            # print(line.markdown['markdown_texts'])
            for p in line.markdown['page_continuation_flags']:
                page_continuation_flags.append( 1 if p else 0)

            line = line['overall_ocr_res']
            for poly, text, score in zip(
                line["rec_polys"],
                line["rec_texts"],
                line["rec_scores"],
            ):
                # poly is numpy array shape (4, 2), dtype int16
                boxes.append([[int(p[0]), int(p[1])] for p in poly])
                texts.append(text)
                # print(text, len(poly), boxes)

                scores.append(float(score))
    return boxes, texts, scores, markdown_texts, page_continuation_flags


def parse_page_range(page_range: str, total: int) -> list[int]:
    """Parse page range like '0-9' or '0,2,5-8'."""
    pages = set()
    for part in page_range.split(","):
        part = part.strip()
        if "-" in part:
            start, end = part.split("-", 1)
            start = int(start)
            end = min(int(end), total - 1)
            pages.update(range(start, end + 1))
        else:
            p = int(part)
            if 0 <= p < total:
                pages.add(p)
    return sorted(pages)


def main():
    parser = argparse.ArgumentParser(
        description="Process a PDF with PaddleOCR and save results as .ocrdiff file"
    )
    parser.add_argument("pdf", help="Path to input PDF file")
    parser.add_argument("-o", "--output", help="Output .ocrdiff file path (default: <pdf_name>.ocrdiff)")
    parser.add_argument("--lang", default="ch", help="OCR language (default: ch)")
    parser.add_argument("--engine", default="paddle_static", help="OCR engine (default: paddle_static)")
    parser.add_argument("--device", default="gpu:0", help="Device (default: gpu:0)")
    parser.add_argument("--dpi", type=int, default=200, help="Render DPI (default: 200)")
    parser.add_argument("--pages", help="Page range, e.g. '0-9' or '0,2,5-8' (default: all)")
    args = parser.parse_args()

    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        print(f"Error: PDF file not found: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    output_path = Path(args.output) if args.output else pdf_path.with_suffix(".ocrdiff")

    # Open PDF
    doc = fitz.open(str(pdf_path))
    total_pages = len(doc)
    print(f"PDF: {pdf_path.name}, {total_pages} pages, DPI: {args.dpi}")

    # Determine pages to process
    if args.pages:
        page_list = parse_page_range(args.pages, total_pages)
        print(f"Processing pages: {page_list}")
    else:
        page_list = list(range(total_pages))

    # Init OCR
    print(f"Initializing PaddleOCR (lang={args.lang}, engine={args.engine}, device={args.device})...")
    ocr = create_ocr_engine(args.lang, args.engine, args.device)

    # Process pages
    manifest = {
        "ocrdiff_version": 1,
        "pdf_name": pdf_path.name,
        "dpi": args.dpi,
        "source": "local_cli",
        "total_pages": total_pages,
        "created_at": datetime.now().isoformat(),
        "base": {"pages": []},
        "edits": [],
    }

    with zipfile.ZipFile(str(output_path), "w", zipfile.ZIP_DEFLATED) as zf:
        for i, page_num in enumerate(page_list):
            t0 = time.time()

            # Render
            png_bytes = render_page(doc, page_num, args.dpi)

            # OCR
            boxes, texts, scores, markdown_texts, page_continuation_flags = ocr_png_bytes(ocr, png_bytes, page_num)
            full_text = "\n".join(texts)

            # Write image to zip
            img_name = f"pages/page_{page_num:04d}.png"
            zf.writestr(img_name, png_bytes)

            # Add to base pages in manifest
            manifest["base"]["pages"].append({
                "page": page_num,
                "image": img_name,
                "text": full_text,
                "boxes": boxes,
                "scores": scores,
                "markdown_texts": markdown_texts,
                "page_continuation_flags": page_continuation_flags,
            })

            elapsed = time.time() - t0
            print(f"  [{i+1}/{len(page_list)}] Page {page_num+1}: {len(texts)} text regions, {elapsed:.1f}s")

        # Write manifest
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))

    doc.close()

    size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"\nDone! Output: {output_path} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
