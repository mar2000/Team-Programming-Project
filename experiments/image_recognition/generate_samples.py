"""Generate deterministic graph-image samples for the image-recognition experiment."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
SAMPLES = ROOT / "samples"


def _font(size: int = 22) -> ImageFont.ImageFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size=size)
    return ImageFont.load_default()


def _draw_sample(name: str, vertices: list[dict[str, Any]], edges: list[tuple[int, int]], *,
                 radius: int = 12, line_width: int = 3, noisy: bool = False) -> dict[str, Any]:
    image = Image.new("RGB", (640, 420), "white")
    draw = ImageDraw.Draw(image)
    font = _font()

    for source, target in edges:
        a = vertices[source]
        b = vertices[target]
        draw.line((a["x"], a["y"], b["x"], b["y"]), fill="black", width=line_width)

    for vertex in vertices:
        x, y = vertex["x"], vertex["y"]
        draw.ellipse((x-radius, y-radius, x+radius, y+radius), fill="white", outline="black", width=3)
        draw.text((x + radius + 8, y - radius - 8), vertex["label"], fill="black", font=font)

    if noisy:
        # Deterministic low-level clutter, deliberately away from vertices.
        for x in range(35, 610, 43):
            y = 390 - (x % 17)
            draw.point((x, y), fill=(145, 145, 145))
        draw.line((25, 365, 120, 365), fill=(210, 210, 210), width=1)

    path = SAMPLES / f"{name}.png"
    image.save(path)
    return {
        "image": path.name,
        "vertices": [{"id": f"v{i+1}", **vertex} for i, vertex in enumerate(vertices)],
        "edges": [{"source": f"v{s+1}", "target": f"v{t+1}"} for s, t in edges],
    }


def generate() -> list[dict[str, Any]]:
    SAMPLES.mkdir(parents=True, exist_ok=True)
    truth = [
        _draw_sample(
            "triangle_clean",
            [
                {"x": 150, "y": 95, "label": "A"},
                {"x": 90, "y": 300, "label": "B"},
                {"x": 350, "y": 300, "label": "C"},
            ],
            [(0, 1), (1, 2), (2, 0)],
        ),
        _draw_sample(
            "path_clean",
            [
                {"x": 90, "y": 190, "label": "P"},
                {"x": 235, "y": 95, "label": "Q"},
                {"x": 380, "y": 190, "label": "R"},
                {"x": 525, "y": 95, "label": "S"},
            ],
            [(0, 1), (1, 2), (2, 3)],
        ),
        _draw_sample(
            "square_diagonal_noisy",
            [
                {"x": 125, "y": 95, "label": "W"},
                {"x": 430, "y": 95, "label": "X"},
                {"x": 430, "y": 310, "label": "Y"},
                {"x": 125, "y": 310, "label": "Z"},
            ],
            [(0, 1), (1, 2), (2, 3), (3, 0), (0, 2)],
            noisy=True,
        ),
    ]
    (SAMPLES / "ground_truth.json").write_text(json.dumps(truth, indent=2), encoding="utf-8")
    return truth


if __name__ == "__main__":
    generated = generate()
    print(f"Generated {len(generated)} samples in {SAMPLES}")
