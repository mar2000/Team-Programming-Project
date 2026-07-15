"""Human-reviewed image recognition import.

Step 91 adds a recognizer tuned for screenshots exported from Route Editor:
small filled points, straight segments, pale grid lines and geometric circles.
"""
from __future__ import annotations

import base64
import tempfile
from itertools import combinations
from pathlib import Path
from typing import Any, Mapping

import cv2
import numpy as np
from PIL import Image

MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000
ALLOWED_SUFFIXES = {'.png', '.jpg', '.jpeg'}


def _data_uri(image: np.ndarray) -> str:
    ok, encoded = cv2.imencode('.png', image)
    if not ok:
        return ''
    return 'data:image/png;base64,' + base64.b64encode(encoded.tobytes()).decode('ascii')


def _deduplicate_points(points: list[dict[str, Any]], distance: float = 14.0) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for point in sorted(points, key=lambda item: (item['y'], item['x'])):
        if all(np.hypot(point['x'] - other['x'], point['y'] - other['y']) >= distance for other in result):
            result.append(point)
    return result


def _detect_filled_points(gray: np.ndarray) -> list[dict[str, Any]]:
    """Find small filled dots while suppressing thin lines and a pale grid."""
    dark = np.where(gray < 115, 255, 0).astype(np.uint8)
    opened = cv2.morphologyEx(
        dark,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)),
    )
    count, _, stats, centroids = cv2.connectedComponentsWithStats(opened)
    candidates: list[dict[str, Any]] = []
    for index in range(1, count):
        x, y, width, height, area = stats[index]
        if not (24 <= area <= 420 and 5 <= width <= 26 and 5 <= height <= 26):
            continue
        aspect = width / max(height, 1)
        if not 0.55 <= aspect <= 1.8:
            continue
        cx, cy = centroids[index]
        radius = max(4, int(round((width + height) / 4)))
        candidates.append({
            'x': int(round(cx)), 'y': int(round(cy)), 'radius': radius,
            'method': 'filled-dot', 'confidence': 0.95,
        })
    return _deduplicate_points(candidates)


def _line_darkness(binary: np.ndarray, a: dict[str, Any], b: dict[str, Any]) -> float:
    x1, y1 = float(a['x']), float(a['y'])
    x2, y2 = float(b['x']), float(b['y'])
    length = max(int(np.hypot(x2 - x1, y2 - y1)), 1)
    values: list[int] = []
    endpoint_margin = max(8, int(a.get('radius', 5)) + 3, int(b.get('radius', 5)) + 3)
    for t in np.linspace(0.0, 1.0, length + 1):
        if t * length < endpoint_margin or (1.0 - t) * length < endpoint_margin:
            continue
        x = int(round(x1 + t * (x2 - x1)))
        y = int(round(y1 + t * (y2 - y1)))
        patch = binary[max(0, y - 1):y + 2, max(0, x - 1):x + 2]
        if patch.size:
            values.append(int(np.max(patch)))
    return float(np.mean(values)) if values else 0.0


def _detect_segments(gray: np.ndarray, points: list[dict[str, Any]]) -> list[dict[str, Any]]:
    binary = (gray < 170).astype(np.uint8)
    edges: list[dict[str, Any]] = []
    for source, target in combinations(range(len(points)), 2):
        score = _line_darkness(binary, points[source], points[target])
        if score >= 0.64:
            edges.append({'source': source, 'target': target, 'confidence': round(score, 3)})
    return edges


def _circle_support(gray: np.ndarray, x: int, y: int, radius: int) -> float:
    hits: list[bool] = []
    height, width = gray.shape[:2]
    for angle in np.linspace(0.0, 2.0 * np.pi, 720, endpoint=False):
        px = int(round(x + radius * np.cos(angle)))
        py = int(round(y + radius * np.sin(angle)))
        patch = gray[max(0, py - 2):min(height, py + 3), max(0, px - 2):min(width, px + 3)]
        hits.append(bool(patch.size and np.min(patch) < 175))
    return float(np.mean(hits)) if hits else 0.0


def _detect_circles(gray: np.ndarray) -> list[dict[str, Any]]:
    height, width = gray.shape[:2]
    blurred = cv2.GaussianBlur(gray, (5, 5), 1.2)
    raw = cv2.HoughCircles(
        blurred, cv2.HOUGH_GRADIENT, dp=1.2, minDist=50,
        param1=100, param2=35,
        minRadius=max(18, min(width, height) // 14),
        maxRadius=max(25, min(width, height) // 2),
    )
    candidates: list[dict[str, Any]] = []
    if raw is not None:
        for x, y, radius in np.round(raw[0]).astype(int):
            if x - radius < -4 or y - radius < -4 or x + radius > width + 4 or y + radius > height + 4:
                continue
            support = _circle_support(gray, int(x), int(y), int(radius))
            if support >= 0.58:
                candidates.append({
                    'id': f'c{len(candidates) + 1}', 'x': int(x), 'y': int(y),
                    'radius': int(radius), 'confidence': round(support, 3),
                    'method': 'hough-support',
                })
    result: list[dict[str, Any]] = []
    for circle in sorted(candidates, key=lambda item: item['confidence'], reverse=True):
        duplicate = any(
            np.hypot(circle['x'] - other['x'], circle['y'] - other['y']) < 18
            and abs(circle['radius'] - other['radius']) < 18
            for other in result
        )
        if not duplicate:
            circle['id'] = f'c{len(result) + 1}'
            result.append(circle)
    return result


def _annotated_image(image: np.ndarray, graph: dict[str, Any]) -> np.ndarray:
    annotated = image.copy()
    vertices = graph['vertices']
    by_id = {item['id']: item for item in vertices}
    for edge in graph['edges']:
        a, b = by_id[edge['source']], by_id[edge['target']]
        cv2.line(annotated, (a['x'], a['y']), (b['x'], b['y']), (22, 163, 74), 3)
    for circle in graph.get('circles', []):
        cv2.circle(annotated, (circle['x'], circle['y']), circle['radius'], (217, 119, 6), 3)
        cv2.circle(annotated, (circle['x'], circle['y']), 4, (217, 119, 6), -1)
    for vertex in vertices:
        cv2.circle(annotated, (vertex['x'], vertex['y']), max(9, vertex.get('radius', 5) + 4), (37, 99, 235), 3)
        cv2.putText(annotated, vertex['id'], (vertex['x'] + 10, vertex['y'] - 10), cv2.FONT_HERSHEY_SIMPLEX, .45, (37, 99, 235), 1, cv2.LINE_AA)
    return annotated


def recognize_image_bytes(content: bytes, filename: str) -> dict[str, Any]:
    if not content:
        raise ValueError('Plik obrazu jest pusty.')
    if len(content) > MAX_IMAGE_BYTES:
        raise ValueError('Plik obrazu jest za duży. Maksymalny rozmiar to 8 MB.')
    suffix = Path(filename or '').suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise ValueError('Obsługiwane są pliki PNG, JPG i JPEG.')

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as temporary:
        temporary.write(content); temporary.flush()
        try:
            with Image.open(temporary.name) as image:
                width, height = image.size; image.verify()
        except Exception as exc:
            raise ValueError('Nie udało się odczytać poprawnego obrazu.') from exc
        if width * height > MAX_IMAGE_PIXELS:
            raise ValueError('Obraz ma zbyt dużą rozdzielczość.')
        image = cv2.imread(temporary.name)
        if image is None:
            raise ValueError('Nie udało się odczytać obrazu przez OpenCV.')

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    detected = _detect_filled_points(gray)
    vertices = [
        {'id': f'v{i + 1}', 'x': p['x'], 'y': p['y'], 'radius': p['radius'],
         'label': '', 'detector': p['method'], 'confidence': p['confidence']}
        for i, p in enumerate(detected)
    ]
    raw_edges = _detect_segments(gray, detected)
    edges = [
        {'source': f"v{edge['source'] + 1}", 'target': f"v{edge['target'] + 1}", 'confidence': edge['confidence']}
        for edge in raw_edges
    ]
    circles = _detect_circles(gray)
    graph = {'vertices': vertices, 'edges': edges, 'circles': circles}
    annotated = _annotated_image(image, graph)

    mime = 'image/png' if suffix == '.png' else 'image/jpeg'
    return {
        'graph': graph,
        'image_data_uri': f'data:{mime};base64,{base64.b64encode(content).decode("ascii")}',
        'diagnostic_data_uri': _data_uri(annotated),
        'width': width, 'height': height, 'filename': Path(filename).name,
        'warnings': [],
        'summary': {'vertices': len(vertices), 'edges': len(edges), 'circles': len(circles)},
    }


def reviewed_graph_from_post(graph: dict[str, Any], post: Mapping[str, Any]) -> dict[str, Any]:
    vertices = graph.get('vertices', []); edges = graph.get('edges', []); circles = graph.get('circles', [])
    if not isinstance(vertices, list) or not isinstance(edges, list) or not isinstance(circles, list):
        raise ValueError('Niepoprawna struktura wyniku rozpoznawania.')
    kept_vertices: list[dict[str, Any]] = []; kept_ids: set[str] = set()
    for vertex in vertices:
        vertex_id = str(vertex.get('id', ''))
        if not vertex_id or post.get(f'vertex_include_{vertex_id}') != 'on':
            continue
        updated = dict(vertex)
        updated['label'] = str(post.get(f'label_{vertex_id}', vertex.get('label', ''))).strip()[:40]
        kept_vertices.append(updated); kept_ids.add(vertex_id)
    kept_edges = []
    for index, edge in enumerate(edges):
        if post.get(f'edge_include_{index}') != 'on': continue
        source, target = str(edge.get('source', '')), str(edge.get('target', ''))
        if source in kept_ids and target in kept_ids and source != target: kept_edges.append(dict(edge))
    kept_circles = [dict(circle) for index, circle in enumerate(circles) if post.get(f'circle_include_{index}') == 'on']
    if not kept_vertices and not kept_circles:
        raise ValueError('Pozostaw co najmniej jeden punkt albo okrąg.')
    result = {'vertices': kept_vertices, 'edges': kept_edges}
    if 'circles' in graph:
        result['circles'] = kept_circles
    return result
