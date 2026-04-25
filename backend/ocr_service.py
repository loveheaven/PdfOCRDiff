"""PaddleOCR wrapper service."""

from paddleocr import PaddleOCR
from config import OCR_LANG, OCR_USE_GPU

_ocr_instance: PaddleOCR | None = None


def get_ocr() -> PaddleOCR:
    """Lazy-init singleton PaddleOCR instance."""
    global _ocr_instance
    if _ocr_instance is None:
        _ocr_instance = PaddleOCR(use_angle_cls=True, lang=OCR_LANG, use_gpu=OCR_USE_GPU)
    return _ocr_instance


def ocr_image_bytes(image_bytes: bytes) -> tuple[list[list[list[float]]], list[str], list[float]]:
    """
    Run OCR on image bytes.

    Returns:
        boxes: list of [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
        texts: list of recognized text strings
        scores: list of confidence scores
    """
    import numpy as np
    from PIL import Image
    import io

    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_array = np.array(image)

    ocr = get_ocr()
    result = ocr.ocr(img_array, cls=True)

    boxes = []
    texts = []
    scores = []

    if result and result[0]:
        for line in result[0]:
            box, (text, score) = line
            boxes.append(box)
            texts.append(text)
            scores.append(score)

    return boxes, texts, scores


def ocr_to_text(image_bytes: bytes) -> str:
    """Run OCR and return concatenated text."""
    _, texts, _ = ocr_image_bytes(image_bytes)
    return "\n".join(texts)
