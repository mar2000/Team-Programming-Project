"""Combine detections into a JSON graph structure."""
from __future__ import annotations

from typing import Any


def reconstruct_graph(vertices: list[dict[str, Any]], edges: list[dict[str, Any]], labels: list[dict[str, Any]]) -> dict[str, Any]:
    graph_vertices = []
    for index, vertex in enumerate(vertices):
        graph_vertices.append({
            "id": f"v{index + 1}",
            "x": int(vertex["x"]),
            "y": int(vertex["y"]),
            "radius": int(vertex.get("radius", 0)),
            "label": labels[index]["text"] if index < len(labels) else "",
            "detector": vertex.get("method", "unknown"),
        })
    graph_edges = [
        {
            "source": f"v{edge['source'] + 1}",
            "target": f"v{edge['target'] + 1}",
            "confidence": edge["confidence"],
        }
        for edge in edges
    ]
    return {"vertices": graph_vertices, "edges": graph_edges}
