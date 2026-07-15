"""Run the complete image-recognition image-recognition experiment."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import cv2

try:
    from .detect_edges import detect_edges
    from .detect_labels import detect_labels
    from .detect_vertices import detect_vertices
    from .generate_samples import generate
    from .reconstruct_graph import reconstruct_graph
    from .to_route_editor import graph_to_route_editor_document
except ImportError:  # direct script execution
    from detect_edges import detect_edges
    from detect_labels import detect_labels
    from detect_vertices import detect_vertices
    from generate_samples import generate
    from reconstruct_graph import reconstruct_graph
    from to_route_editor import graph_to_route_editor_document

ROOT = Path(__file__).resolve().parent
RESULTS = ROOT / "results"


def _match_vertices(expected: list[dict[str, Any]], detected: list[dict[str, Any]], tolerance: float = 18.0) -> dict[int, int]:
    mapping: dict[int, int] = {}
    unused = set(range(len(detected)))
    for expected_index, vertex in enumerate(expected):
        candidates = sorted(
            ((index, ((detected[index]["x"] - vertex["x"]) ** 2 + (detected[index]["y"] - vertex["y"]) ** 2) ** 0.5) for index in unused),
            key=lambda item: item[1],
        )
        if candidates and candidates[0][1] <= tolerance:
            mapping[expected_index] = candidates[0][0]
            unused.remove(candidates[0][0])
    return mapping


def _evaluate(truth: dict[str, Any], graph: dict[str, Any]) -> dict[str, Any]:
    mapping = _match_vertices(truth["vertices"], graph["vertices"])
    expected_edges = {
        tuple(sorted((int(edge["source"][1:]) - 1, int(edge["target"][1:]) - 1)))
        for edge in truth["edges"]
    }
    inverse = {detected: expected for expected, detected in mapping.items()}
    detected_edges = set()
    for edge in graph["edges"]:
        source = int(edge["source"][1:]) - 1
        target = int(edge["target"][1:]) - 1
        if source in inverse and target in inverse:
            detected_edges.add(tuple(sorted((inverse[source], inverse[target]))))

    correct_labels = 0
    for expected_index, detected_index in mapping.items():
        expected = truth["vertices"][expected_index]["label"].upper()
        actual = graph["vertices"][detected_index]["label"].upper()
        correct_labels += int(actual == expected)

    vertex_recall = len(mapping) / max(len(truth["vertices"]), 1)
    vertex_precision = len(mapping) / max(len(graph["vertices"]), 1)
    edge_tp = len(expected_edges & detected_edges)
    edge_precision = edge_tp / max(len(detected_edges), 1)
    edge_recall = edge_tp / max(len(expected_edges), 1)
    label_accuracy = correct_labels / max(len(truth["vertices"]), 1)
    return {
        "vertex_precision": round(vertex_precision, 3),
        "vertex_recall": round(vertex_recall, 3),
        "edge_precision": round(edge_precision, 3),
        "edge_recall": round(edge_recall, 3),
        "label_accuracy": round(label_accuracy, 3),
    }


def _annotate(image_path: Path, graph: dict[str, Any], output_path: Path) -> None:
    image = cv2.imread(str(image_path))
    for vertex in graph["vertices"]:
        center = (vertex["x"], vertex["y"])
        cv2.circle(image, center, max(vertex["radius"], 14), (0, 0, 255), 2)
        cv2.putText(image, vertex["label"] or "?", (center[0] + 10, center[1] - 18), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 0, 0), 2)
    by_id = {vertex["id"]: vertex for vertex in graph["vertices"]}
    for edge in graph["edges"]:
        a, b = by_id[edge["source"]], by_id[edge["target"]]
        cv2.line(image, (a["x"], a["y"]), (b["x"], b["y"]), (0, 170, 0), 2)
    cv2.imwrite(str(output_path), image)


def run() -> dict[str, Any]:
    truth_items = generate()
    RESULTS.mkdir(parents=True, exist_ok=True)
    runs = []
    for truth in truth_items:
        image_path = ROOT / "samples" / truth["image"]
        vertices = detect_vertices(image_path)
        edges = detect_edges(image_path, vertices)
        labels = detect_labels(image_path, vertices)
        graph = reconstruct_graph(vertices, edges, labels)
        metrics = _evaluate(truth, graph)
        stem = image_path.stem
        image = cv2.imread(str(image_path))
        canvas_height, canvas_width = image.shape[:2]
        route_editor_document = graph_to_route_editor_document(
            graph,
            title=f"Rozpoznany graf — {stem}",
            source_image=truth["image"],
            canvas_width=canvas_width,
            canvas_height=canvas_height,
        )
        (RESULTS / f"{stem}.json").write_text(json.dumps({"graph": graph, "metrics": metrics}, indent=2), encoding="utf-8")
        (RESULTS / f"{stem}_route_editor.json").write_text(
            json.dumps(route_editor_document, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        _annotate(image_path, graph, RESULTS / f"{stem}_annotated.png")
        runs.append({
            "sample": truth["image"],
            "metrics": metrics,
            "detected": graph,
            "route_editor_file": f"{stem}_route_editor.json",
        })

    means = {
        key: round(sum(run["metrics"][key] for run in runs) / len(runs), 3)
        for key in ("vertex_precision", "vertex_recall", "edge_precision", "edge_recall", "label_accuracy")
    }
    summary = {"samples": runs, "mean_metrics": means}
    (RESULTS / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary


if __name__ == "__main__":
    summary = run()
    print(json.dumps(summary["mean_metrics"], indent=2))
