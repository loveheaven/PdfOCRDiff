"""Application configuration."""

import os

# Server
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# CORS – allow Tauri webview and dev server
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:1420,https://tauri.localhost").split(",")

# PaddleOCR
OCR_LANG = os.getenv("OCR_LANG", "ch")  # ch, en, japan, korean, ...
OCR_USE_GPU = os.getenv("OCR_USE_GPU", "false").lower() == "true"

# Temp storage
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "/tmp/pdfocrdiff")
