from __future__ import annotations

import base64
import json
import math
import random
import re
from dataclasses import dataclass


def color_value(value: str) -> str:
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
        raise ValueError("Choose a six-digit hex color, such as #5eead4.")
    return value


@dataclass(frozen=True)
class FlowInk:
    color: str = "#5eead4"
    strands: int = 42
    bend: float = 2.8
    enabled: bool = True

    def draw(self, rng: random.Random) -> list[str]:
        if not 1 <= self.strands <= 120 or not math.isfinite(self.bend):
            raise ValueError("FlowInk needs 1-120 strands and a finite bend.")
        phase = rng.uniform(0, math.tau)
        paths = []
        for strand in range(self.strands):
            points = []
            radius = 28 + strand * 5.6
            for step in range(73):
                angle = step / 72 * math.tau * 0.82 + phase + strand * 0.018
                ripple = (
                    math.sin(angle * 3 + self.bend + strand * 0.055) * self.bend * 13
                )
                x = 400 + (radius + ripple) * math.cos(angle)
                y = 400 + (radius * 0.73 + ripple) * math.sin(angle + self.bend * 0.11)
                points.append(f"{'M' if step == 0 else 'L'}{x:.1f},{y:.1f}")
            opacity = 0.25 + strand / self.strands * 0.55
            paths.append(
                (
                    f'<path d="{" ".join(points)}" fill="none" '
                    f'stroke="{color_value(self.color)}" stroke-width="1.25" '
                    f'opacity="{opacity:.2f}"/>'
                )
            )
        return paths


@dataclass(frozen=True)
class OrbitRings:
    color: str = "#f9a8d4"
    count: int = 9
    tilt: float = 35
    enabled: bool = True

    def draw(self, rng: random.Random) -> list[str]:
        if not 1 <= self.count <= 32 or not math.isfinite(self.tilt):
            raise ValueError("OrbitRings needs 1-32 rings and a finite tilt.")
        center = (400 + rng.uniform(-60, 60), 400 + rng.uniform(-60, 60))
        return [
            (
                f'<ellipse cx="{center[0]:.1f}" cy="{center[1]:.1f}" '
                f'rx="{100 + index * 12}" ry="{35 + index * 7}" '
                f'transform="rotate({self.tilt + index * 3:.1f} 400 400)" '
                f'fill="none" stroke="{color_value(self.color)}" '
                f'stroke-width="{1.5 if index % 3 else 3}" opacity="0.6"/>'
            )
            for index in range(self.count)
        ]


@dataclass(frozen=True)
class StarField:
    color: str = "#fbbf24"
    count: int = 100
    size: float = 1.8
    enabled: bool = True

    def draw(self, rng: random.Random) -> list[str]:
        if not 1 <= self.count <= 400 or not 0 < self.size <= 6:
            raise ValueError("StarField needs 1-400 stars and a size between 0 and 6.")
        stars = []
        for index in range(self.count):
            x, y = rng.uniform(40, 760), rng.uniform(40, 760)
            radius = rng.uniform(0.4, self.size)
            stars.append(
                (
                    f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{radius:.1f}" '
                    f'fill="{color_value(self.color)}" '
                    f'opacity="{rng.uniform(0.3, 0.9):.2f}"/>'
                )
            )
            if index % 17 == 0:
                stars.append(
                    (
                        f'<path d="M{x - 5:.1f},{y:.1f}h10M{x:.1f},{y - 5:.1f}v10" '
                        f'stroke="{self.color}" stroke-width="0.7" opacity="0.7"/>'
                    )
                )
        return stars


Layer = FlowInk | OrbitRings | StarField


def artwork(
    layers: list[Layer], seed: int, background: str, symmetry: int
) -> tuple[str, list[int]]:
    if not 1 <= symmetry <= 8:
        raise ValueError("Choose symmetry between 1 and 8.")
    rng = random.Random(seed)
    strokes = []
    counts = []
    for layer in layers:
        shapes = layer.draw(rng) if layer.enabled else []
        strokes.extend(shapes)
        counts.append(len(shapes) * symmetry)
    identity = f"art-{seed}"
    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">',
        (f'<rect width="800" height="800" fill="{color_value(background)}"/>'),
        f'<defs><g id="{identity}">',
        *strokes,
        "</g></defs>",
    ]
    for index in range(symmetry):
        parts.append(
            (
                f'<use href="#{identity}" '
                f'transform="rotate({index * 360 / symmetry:.1f} 400 400)"/>'
            )
        )
    parts.append(
        (
            '<rect x="18" y="18" width="764" height="764" rx="12" '
            'fill="none" stroke="#ffffff" stroke-opacity="0.12"/></svg>'
        )
    )
    return "".join(parts), counts


def image_panel(identity: str, title: str, caption: str, svg: str) -> dict:
    return {
        "id": identity,
        "kind": "image",
        "title": title,
        "caption": caption,
        "image": "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode(),
    }


def render_gallery(
    layers: list[Layer], seed: int = 9, background: str = "#0a1424", symmetry: int = 3
) -> list[dict]:
    main, counts = artwork(layers, seed, background, symmetry)
    gallery = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 840 910">',
        '<rect width="840" height="910" rx="18" fill="#0b1725"/>',
        (
            '<text x="25" y="34" fill="#e2e8f0" font-family="sans-serif" '
            'font-size="18">SAME RECIPE / FOUR NEW SEEDS</text>'
        ),
    ]
    for index in range(4):
        variant_seed = seed + index + 1
        variant, _ = artwork(layers, variant_seed, background, symmetry)
        inner = variant[variant.index(">") + 1 : -6]
        x, y = 20 + index % 2 * 410, 55 + index // 2 * 422
        gallery.append(
            (
                f'<svg x="{x}" y="{y}" width="390" height="390" viewBox="0 0 '
                f'800 800">{inner}</svg><text x="{x}" y="{y + 410}" '
                f'fill="#a5b5cd" font-family="sans-serif" font-size="14">SEED '
                f"{variant_seed}</text>"
            )
        )
    gallery.append("</svg>")
    active = sum(layer.enabled for layer in layers)
    notes = (
        f"## Your composition\n\n**Seed {seed} · {symmetry}-fold "
        f"symmetry · {active} active layers · {sum(counts):,} vector "
        f"marks.**\n\nLayer order is paint order: later layers appear "
        f"on top. Switch off a layer to see its contribution, or move "
        f"it in the list to change the stack.\n\n**Quiet print:** "
        f"reduce ink strands to 12, turn stars off, and try symmetry "
        f"2.\n\n**Cosmic storm:** raise bend to 5, try 80 strands and "
        f"symmetry 5, then add more rings.\n\nSave image downloads the "
        f"exact SVG. A fixed seed makes it reproducible; the gallery "
        f"offers four neighboring seeds to explore."
    )
    return [
        image_panel(
            "artwork",
            "Your artwork",
            (
                f"Seed {seed}. Change a layer or color, then Run. Save image "
                f"keeps this exact vector composition."
            ),
            main,
        ),
        image_panel(
            "variations",
            "Seed variations",
            (
                "Enter a favorite seed in Canvas to make it the main artwork. "
                "These variations use the same layer settings."
            ),
            "".join(gallery),
        ),
        {
            "id": "palette",
            "kind": "table",
            "title": "Palette & layers",
            "caption": (
                "The list order is the paint order. Disabled layers contribute "
                "no marks."
            ),
            "columns": ["Layer", "Color", "Enabled", "Marks"],
            "rows": [
                [type(layer).__name__, layer.color, layer.enabled, count]
                for layer, count in zip(layers, counts, strict=True)
            ],
        },
        {
            "id": "notes",
            "kind": "markdown",
            "title": "Studio notes",
            "caption": (
                "The artwork is produced by the Python objects in your Layers list."
            ),
            "text": notes,
        },
    ]


def show(panels: list[dict]) -> None:
    print(
        "SETTA_DISPLAY " + json.dumps({"version": 1, "panels": panels}, allow_nan=False)
    )
