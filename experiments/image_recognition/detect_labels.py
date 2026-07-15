"""Small OCR probe for labels near detected graph vertices."""
from __future__ import annotations

from pathlib import Path
from typing import Any

import cv2
import pytesseract


def detect_labels(image_path: str | Path, vertices: list[dict[str, Any]]) -> list[dict[str, Any]]:
    image = cv2.imread(str(image_path))
    if image is None:
        raise FileNotFoundError(f"Cannot read image: {image_path}")
    height, width = image.shape[:2]
    result: list[dict[str, Any]] = []

    for vertex in vertices:
        x, y = int(vertex["x"]), int(vertex["y"])
        # Samples place the label right and slightly above the vertex.
        x1, y1 = max(0, x + 14), max(0, y - 32)
        x2, y2 = min(width, x + 62), min(height, y + 16)
        crop = image[y1:y2, x1:x2]
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        gray = cv2.resize(gray, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
        gray = cv2.threshold(gray, 190, 255, cv2.THRESH_BINARY)[1]
        text = pytesseract.image_to_string(
            gray,
            config="--psm 10 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
        ).strip().replace("\n", "")
        result.append({"text": text[:4], "bbox": [x1, y1, x2, y2]})
    return result
