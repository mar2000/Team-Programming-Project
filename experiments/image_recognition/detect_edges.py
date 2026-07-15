"""Infer graph edges by measuring dark pixels along pairs of detected vertices."""
from __future__ import annotations

from itertools import combinations
from pathlib import Path
from typing import Any

import cv2
import numpy as np


def _line_darkness(binary: np.ndarray, a: dict[str, Any], b: dict[str, Any], radius: int = 17) -> float:
    x1, y1 = float(a["x"]), float(a["y"])
    x2, y2 = float(b["x"]), float(b["y"])
    length = max(int(np.hypot(x2 - x1, y2 - y1)), 1)
    ts = np.linspace(0.0, 1.0, length + 1)
    values: list[int] = []
    for t in ts:
        # Ignore circle borders near both endpoints.
        if t * length < radius or (1.0 - t) * length < radius:
            continue
        x = int(round(x1 + t * (x2 - x1)))
        y = int(round(y1 + t * (y2 - y1)))
        patch = binary[max(0, y-2):y+3, max(0, x-2):x+3]
        if patch.size:
            values.append(int(np.max(patch)))
    return float(np.mean(np.asarray(values) > 0)) if values else 0.0


def detect_edges(image_path: str | Path, vertices: list[dict[str, Any]], threshold: float = 0.72) -> list[dict[str, Any]]:
    gray = cv2.imread(str(image_path), cv2.IMREAD_GRAYSCALE)
    if gray is None:
        raise FileNotFoundError(f"Cannot read image: {image_path}")
    binary = cv2.threshold(gray, 180, 255, cv2.THRESH_BINARY_INV)[1]

    edges: list[dict[str, Any]] = []
    for source, target in combinations(range(len(vertices)), 2):
        score = _line_darkness(binary, vertices[source], vertices[target])
        if score >= threshold:
            edges.append({"source": source, "target": target, "confidence": round(score, 3)})
    return edges
