"""Vertex detection based on Hough circles with a contour fallback."""
from __future__ import annotations

from pathlib import Path
from typing import Any

import cv2
import numpy as np


def _deduplicate(points: list[dict[str, Any]], distance: float = 18.0) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for point in sorted(points, key=lambda item: (item["x"], item["y"])):
        if all(np.hypot(point["x"] - other["x"], point["y"] - other["y"]) >= distance for other in result):
            result.append(point)
    return result


def detect_vertices(image_path: str | Path) -> list[dict[str, Any]]:
    gray = cv2.imread(str(image_path), cv2.IMREAD_GRAYSCALE)
    if gray is None:
        raise FileNotFoundError(f"Cannot read image: {image_path}")

    blurred = cv2.GaussianBlur(gray, (5, 5), 1.1)
    circles = cv2.HoughCircles(
        blurred,
        cv2.HOUGH_GRADIENT,
        dp=1.1,
        minDist=28,
        param1=100,
        param2=25,
        minRadius=8,
        maxRadius=18,
    )
    candidates: list[dict[str, Any]] = []
    if circles is not None:
        for x, y, radius in np.round(circles[0]).astype(int):
            candidates.append({"x": int(x), "y": int(y), "radius": int(radius), "method": "hough"})

    if not candidates:
        binary = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY_INV)[1]
        contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        for contour in contours:
            area = cv2.contourArea(contour)
            perimeter = cv2.arcLength(contour, True)
            if not (180 <= area <= 900 and perimeter > 0):
                continue
            circularity = 4 * np.pi * area / (perimeter * perimeter)
            if circularity < 0.55:
                continue
            (x, y), radius = cv2.minEnclosingCircle(contour)
            if 8 <= radius <= 20:
                candidates.append({"x": round(x), "y": round(y), "radius": round(radius), "method": "contour"})

    return _deduplicate(candidates)
