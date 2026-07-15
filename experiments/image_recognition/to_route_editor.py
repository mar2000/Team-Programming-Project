"""Convert reviewed Step-91 detections into a Route Editor document."""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

POINT_STYLE = {"stroke": "#111827", "fill": "#111827", "strokeWidth": 1.5, "radius": 5, "visible": True}
HELPER_STYLE = {"stroke": "#94a3b8", "fill": "#94a3b8", "strokeWidth": 1, "radius": 4, "visible": False}
SEGMENT_STYLE = {"stroke": "#111827", "strokeWidth": 2, "lineStyle": "solid", "visible": True}
CIRCLE_STYLE = {"stroke": "#111827", "fill": "none", "strokeWidth": 2, "lineStyle": "solid", "visible": True}
LABEL_STYLE = {"fill": "#111827", "fontSize": 16, "visible": True}


def _safe_token(value: str, fallback: str) -> str:
    token = re.sub(r"[^A-Za-z0-9_-]+", "_", str(value or "")).strip("_")
    return token or fallback


def _nearest_vertex_on_circle(vertices: list[dict[str, Any]], circle: dict[str, Any], tolerance: float = 12.0) -> dict[str, Any] | None:
    best = None
    best_error = float('inf')
    cx, cy, radius = float(circle['x']), float(circle['y']), float(circle['radius'])
    for vertex in vertices:
        error = abs(((float(vertex['x']) - cx) ** 2 + (float(vertex['y']) - cy) ** 2) ** 0.5 - radius)
        if error < best_error:
            best_error, best = error, vertex
    return best if best is not None and best_error <= tolerance else None


def _legacy_graph_document(graph: dict[str, Any], *, title: str, source_image: str | None, canvas_width: int, canvas_height: int, include_labels: bool) -> dict[str, Any]:
    """Keep Step-64 imports compatible when the payload has no circles key."""
    vertices = graph.get('vertices', [])
    edges = graph.get('edges', [])
    objects: list[dict[str, Any]] = []
    id_map: dict[str, str] = {}
    for index, vertex in enumerate(vertices, 1):
        source_id = str(vertex.get('id') or f'v{index}')
        object_id = f"recognized_vertex_{index:03d}_{_safe_token(source_id, str(index))}"
        id_map[source_id] = object_id
        objects.append({'object_id': object_id, 'type': 'graph.vertex', 'data': {'x': int(vertex.get('x', 0)), 'y': int(vertex.get('y', 0)), 'label': ''}, 'style': {"stroke":"#111827","fill":"#ffffff","strokeWidth":2,"radius":10,"visible":True}, 'order': len(objects)})
    for index, edge in enumerate(edges, 1):
        source, target = str(edge.get('source', '')), str(edge.get('target', ''))
        if source in id_map and target in id_map and source != target:
            objects.append({'object_id': f'recognized_edge_{index:03d}', 'type': 'graph.edge', 'data': {'source': id_map[source], 'target': id_map[target], 'label': ''}, 'style': dict(SEGMENT_STYLE), 'order': len(objects)})
    if include_labels:
        for index, vertex in enumerate(vertices, 1):
            text = str(vertex.get('label') or '').strip()
            source_id = str(vertex.get('id') or f'v{index}')
            if text and source_id in id_map:
                objects.append({'object_id': f'recognized_label_{index:03d}', 'type': 'label.relative', 'data': {'baseObjectId': id_map[source_id], 'text': text, 'dx': 14, 'dy': -14}, 'style': dict(LABEL_STYLE), 'order': len(objects)})
    return {'schema_version': 1, 'title': title, 'mode': 'graph', 'settings': {'canvas': {'width': int(canvas_width), 'height': int(canvas_height), 'gridSize': 20, 'showGrid': True, 'snapToGrid': False}}, 'metadata': {'source':'image_recognition_experiment','source_image':Path(source_image).name if source_image else None,'requires_human_review':True}, 'objects': objects}


def graph_to_route_editor_document(
    graph: dict[str, Any], *, title: str = "Rysunek rozpoznany z obrazu",
    source_image: str | None = None, canvas_width: int = 1000,
    canvas_height: int = 600, include_labels: bool = True,
) -> dict[str, Any]:
    if 'circles' not in graph:
        return _legacy_graph_document(graph, title=title, source_image=source_image, canvas_width=canvas_width, canvas_height=canvas_height, include_labels=include_labels)
    vertices = graph.get('vertices', [])
    edges = graph.get('edges', [])
    circles = graph.get('circles', [])
    if not all(isinstance(value, list) for value in (vertices, edges, circles)):
        raise ValueError('Niepoprawna struktura rozpoznanego rysunku.')

    objects: list[dict[str, Any]] = []
    id_map: dict[str, str] = {}
    for index, vertex in enumerate(vertices, 1):
        source_id = str(vertex.get('id') or f'v{index}')
        object_id = f"recognized_point_{index:03d}_{_safe_token(source_id, str(index))}"
        id_map[source_id] = object_id
        objects.append({
            'object_id': object_id, 'type': 'geometry.point',
            'data': {'x': int(round(float(vertex.get('x', 0)))), 'y': int(round(float(vertex.get('y', 0)))), 'label': ''},
            'style': dict(POINT_STYLE), 'order': len(objects),
        })

    for index, edge in enumerate(edges, 1):
        source, target = str(edge.get('source', '')), str(edge.get('target', ''))
        if source not in id_map or target not in id_map or source == target:
            continue
        objects.append({
            'object_id': f'recognized_segment_{index:03d}', 'type': 'geometry.segment',
            'data': {'source': id_map[source], 'target': id_map[target], 'label': '', 'recognition': {'confidence': edge.get('confidence')}},
            'style': dict(SEGMENT_STYLE), 'order': len(objects),
        })

    for index, circle in enumerate(circles, 1):
        cx, cy, radius = int(circle['x']), int(circle['y']), int(circle['radius'])
        center_id = f'recognized_circle_center_{index:03d}'
        radius_id = f'recognized_circle_radius_{index:03d}'
        objects.append({'object_id': center_id, 'type': 'geometry.point', 'data': {'x': cx, 'y': cy, 'label': ''}, 'style': dict(HELPER_STYLE), 'order': len(objects)})
        existing = _nearest_vertex_on_circle(vertices, circle)
        if existing and str(existing.get('id')) in id_map:
            radius_ref = id_map[str(existing['id'])]
        else:
            objects.append({'object_id': radius_id, 'type': 'geometry.point', 'data': {'x': cx + radius, 'y': cy, 'label': ''}, 'style': dict(HELPER_STYLE), 'order': len(objects)})
            radius_ref = radius_id
        objects.append({
            'object_id': f'recognized_circle_{index:03d}', 'type': 'geometry.circle',
            'data': {'center': center_id, 'point': radius_ref, 'label': '', 'recognition': {'confidence': circle.get('confidence')}},
            'style': dict(CIRCLE_STYLE), 'order': len(objects),
        })

    if include_labels:
        for index, vertex in enumerate(vertices, 1):
            text = str(vertex.get('label') or '').strip()
            if not text: continue
            source_id = str(vertex.get('id') or f'v{index}')
            objects.append({
                'object_id': f'recognized_label_{index:03d}', 'type': 'label.relative',
                'data': {'baseObjectId': id_map[source_id], 'text': text, 'dx': 14, 'dy': -14},
                'style': dict(LABEL_STYLE), 'order': len(objects),
            })

    return {
        'schema_version': 1, 'title': title, 'mode': 'geometry',
        'settings': {'canvas': {'width': int(canvas_width), 'height': int(canvas_height), 'gridSize': 20, 'showGrid': True, 'snapToGrid': False}},
        'metadata': {
            'source': 'image_recognition_step_91',
            'source_image': Path(source_image).name if source_image else None,
            'requires_human_review': True,
            'recognition_summary': {'points': len(vertices), 'segments': len(edges), 'circles': len(circles)},
        },
        'objects': objects,
    }
