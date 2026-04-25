"""Application configuration."""

import os

# Server
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# CORS – allow Tauri webview and dev server
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:1420,https://tauri.localhost").split(",")

# PaddleOCR v3 (PP-OCRv5)
OCR_LANG = os.getenv("OCR_LANG", "ch")  # ch, en, japan, korean, ...
OCR_ENGINE = os.getenv("OCR_ENGINE", "paddle_static")  # "paddle_static" (推荐) | "transformers"
OCR_DEVICE = os.getenv("OCR_DEVICE", "cpu")  # "cpu" | "gpu:0" | "gpu:1" ...
OCR_ENABLE_HPI = os.getenv("OCR_ENABLE_HPI", "false").lower() == "true"  # 高性能推理
OCR_USE_TENSORRT = os.getenv("OCR_USE_TENSORRT", "false").lower() == "true"

# Temp storage
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "/tmp/pdfocrdiff")
