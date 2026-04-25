"""PaddleOCR v3 wrapper service (PP-OCRv5)."""

import numpy as np
from PIL import Image
import io

from paddleocr import PaddleOCR
from config import OCR_LANG, OCR_ENGINE, OCR_DEVICE, OCR_ENABLE_HPI, OCR_USE_TENSORRT

_ocr_instance: PaddleOCR | None = None


def get_ocr() -> PaddleOCR:
    """Lazy-init singleton PaddleOCR v3 instance."""
    global _ocr_instance
    if _ocr_instance is None:
        kwargs: dict = {
            "lang": OCR_LANG,
            "engine": OCR_ENGINE,
            "device": OCR_DEVICE,
            "use_doc_orientation_classify": False,
            "use_doc_unwarping": False,
            "use_textline_orientation": False,
        }
        if OCR_ENABLE_HPI:
            kwargs["enable_hpi"] = True
        if OCR_USE_TENSORRT:
            kwargs["use_tensorrt"] = True
            kwargs["precision"] = "fp16"

        _ocr_instance = PaddleOCR(**kwargs)
    return _ocr_instance


def ocr_image_bytes(image_bytes: bytes) -> tuple[list[list[list[float]]], list[str], list[float]]:
    """
    Run OCR on image bytes using PaddleOCR v3 predict() API.

    Returns:
        boxes:  list of [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
        texts:  list of recognized text strings
        scores: list of confidence scores
    """
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_array = np.array(image)

    ocr = get_ocr()
    results = ocr.predict(img_array)

    boxes: list[list[list[float]]] = []
    texts: list[str] = []
    scores: list[float] = []

    for res in results:
        json_data = res.json
        # rec_polys: filtered boxes after score thresholding (correspond to rec_texts)
        # dt_polys: all detected boxes (before score filtering)
        if "rec_polys" in json_data and "rec_texts" in json_data and "rec_scores" in json_data:
            for poly, text, score in zip(
                json_data["rec_polys"],
                json_data["rec_texts"],
                json_data["rec_scores"],
            ):
                boxes.append([[float(p[0]), float(p[1])] for p in poly])
                texts.append(text)
                scores.append(float(score))

    return boxes, texts, scores


def ocr_to_text(image_bytes: bytes) -> str:
    """Run OCR and return concatenated text."""
    _, texts, _ = ocr_image_bytes(image_bytes)
    return "\n".join(texts)
