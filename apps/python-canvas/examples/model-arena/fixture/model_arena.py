from __future__ import annotations

import base64
import html
import itertools
import json
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray
from sklearn.base import clone
from sklearn.datasets import make_circles, make_moons
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline, make_pipeline


@dataclass(frozen=True)
class ArenaResult:
    name: str
    model: Pipeline
    train_score: float
    test_score: float
    predictions: NDArray
    learning: list[list[float]]


def dataset(shape: str, noise: float, seed: int) -> tuple[NDArray, NDArray]:
    if not 0 <= noise <= 0.6:
        raise ValueError("Keep noise between 0 and 0.6.")
    if shape == "moons":
        x, y = make_moons(n_samples=1600, noise=noise, random_state=seed)
    elif shape == "rings":
        x, y = make_circles(
            n_samples=1600, noise=noise * 0.5, factor=0.4, random_state=seed
        )
    elif shape == "checkerboard":
        rng = np.random.default_rng(seed)
        x = rng.uniform(-2, 2, (1600, 2))
        y = ((np.floor(x[:, 0]) + np.floor(x[:, 1])) % 2).astype(int)
        x += rng.normal(0, noise * 0.5, x.shape)
    else:
        raise ValueError("Choose moons, rings, or checkerboard for the arena shape.")
    return np.asarray(x), np.asarray(y)


def evaluate(
    models: list,
    features: list,
    shape: str,
    noise: float,
    training_points: int,
    seed: int,
) -> tuple[list[ArenaResult], NDArray, NDArray]:
    if not models:
        raise ValueError("Add at least one classifier to Models, then run again.")
    if not 20 <= training_points <= 1200:
        raise ValueError("Choose between 20 and 1200 training points.")
    points, labels = dataset(shape, noise, seed)
    train_x, test_x, train_y, test_y = train_test_split(
        points, labels, test_size=400, random_state=seed, stratify=labels
    )
    budgets = sorted({20, 40, 80, 160, 320, 640, training_points})
    budgets = [budget for budget in budgets if budget <= training_points]
    results = []
    for estimator in models:
        learning = []
        fitted = None
        for budget in budgets:
            fitted = make_pipeline(
                *(clone(feature) for feature in features), clone(estimator)
            )
            fitted.fit(train_x[:budget], train_y[:budget])
            learning.append(
                [float(budget), round(float(fitted.score(test_x, test_y)) * 100, 2)]
            )
        if fitted is None:
            raise ValueError("No training budget was selected.")
        results.append(
            ArenaResult(
                type(estimator).__name__,
                fitted,
                float(
                    fitted.score(train_x[:training_points], train_y[:training_points])
                )
                * 100,
                float(fitted.score(test_x, test_y)) * 100,
                np.asarray(fitted.predict(test_x)),
                learning,
            )
        )
    return results, test_x, test_y


COLORS = ("#5eead4", "#f9a8d4", "#fbbf24", "#93c5fd")


def decision_maps(
    results: list[ArenaResult], points: NDArray, labels: NDArray, shape: str
) -> str:
    count = len(results)
    width = max(400, count * 352 + 28)
    parts = [
        (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" '
            f'height="470" viewBox="0 0 {width} 470">'
        ),
        f'<rect width="{width}" height="470" rx="18" fill="#0b1725"/>',
    ]
    parts.append(
        (
            f'<text x="24" y="32" fill="#e2e8f0" font-family="sans-serif" '
            f'font-size="17" font-weight="bold">MODEL ARENA / '
            f"{html.escape(shape.upper())}</text>"
        )
    )
    low = points.min(axis=0) - 0.25
    high = points.max(axis=0) + 0.25
    gx, gy = np.meshgrid(
        np.linspace(low[0], high[0], 48), np.linspace(high[1], low[1], 48)
    )
    grid = np.column_stack([gx.ravel(), gy.ravel()])
    for index, result in enumerate(results):
        left = 24 + index * 352
        parts.append(
            (
                f'<text x="{left}" y="67" fill="{COLORS[index % len(COLORS)]}" '
                f'font-family="sans-serif" font-size="15">'
                f"{html.escape(result.name)}</text>"
            )
        )
        regions = result.model.predict(grid).reshape(48, 48)
        for row_index, row in enumerate(regions):
            for region, group in itertools.groupby(
                enumerate(row), key=lambda cell: cell[1]
            ):
                cells = list(group)
                start = cells[0][0]
                color = "#174b52" if region == 0 else "#623447"
                parts.append(
                    (
                        f'<rect x="{left + start * 6.5:.1f}" '
                        f'y="{84 + row_index * 6.5:.1f}" '
                        f'width="{len(cells) * 6.5 + 0.1:.1f}" height="6.6" '
                        f'fill="{color}"/>'
                    )
                )
        for point, label, prediction in zip(
            points[:120], labels[:120], result.predictions[:120], strict=True
        ):
            px = left + (point[0] - low[0]) / (high[0] - low[0]) * 312
            py = 84 + (high[1] - point[1]) / (high[1] - low[1]) * 312
            color = "#5eead4" if label == 0 else "#f9a8d4"
            stroke = "#ffffff" if label != prediction else "#091421"
            radius = 4.2 if label != prediction else 2.8
            parts.append(
                (
                    f'<circle cx="{px:.1f}" cy="{py:.1f}" r="{radius}" '
                    f'fill="{color}" stroke="{stroke}" stroke-width="1.3"/>'
                )
            )
        parts.append(
            (
                f'<text x="{left}" y="426" fill="#f8fafc" '
                f'font-family="sans-serif" font-size="21" font-weight="bold">'
                f'{result.test_score:.1f}% <tspan fill="#a5b5cd" font-size="12" '
                f'font-weight="normal">unseen accuracy</tspan></text>'
            )
        )
    parts.append(
        (
            '<text x="24" y="455" fill="#a5b5cd" font-family="sans-serif" '
            'font-size="12">TEAL / PINK = TRUE CLASSES     BACKGROUND = '
            "PREDICTION     WHITE RING = MISTAKE</text></svg>"
        )
    )
    return "".join(parts)


def compare(
    models: list,
    features: list,
    shape: str = "moons",
    noise: float = 0.18,
    training_points: int = 100,
    seed: int = 7,
) -> list[dict]:
    results, points, labels = evaluate(
        models, features, shape, noise, training_points, seed
    )
    winner = max(results, key=lambda result: result.test_score)
    report = (
        f"## {winner.name} leads this "
        f"round\n\n**{winner.test_score:.1f}% unseen accuracy** from "
        f"**{training_points} training points**. The test set contains "
        f"400 separate samples. The maps draw the first 120 of those "
        f"samples so mistakes stay readable.\n\n"
    )
    report += (
        "**A useful comparison:** the training score shows how well a "
        "model fits what it has seen. A large training-to-unseen gap "
        "is a warning about generalization. Every learning-curve point "
        "is a fresh fit; preprocessing never sees the test set.\n\n"
    )
    report += (
        "Keep the seed fixed when comparing settings. Try another seed "
        "to see how stable your conclusion is. Repeatedly tuning "
        "against this one test set can overfit it too; this is an "
        "exploration tool, not an unbiased final benchmark."
    )
    image = (
        "data:image/svg+xml;base64,"
        + base64.b64encode(
            decision_maps(results, points, labels, shape).encode()
        ).decode()
    )
    return [
        {
            "id": "boundaries",
            "kind": "image",
            "title": "Decision maps",
            "caption": (
                "The same unseen points, three different ways of learning. "
                "White rings reveal mistakes."
            ),
            "image": image,
        },
        {
            "id": "learning",
            "kind": "chart",
            "title": "Learning curves",
            "caption": (
                "Retrained on nested subsets of one training pool. More "
                "examples may help, but performance need not rise at every "
                "step."
            ),
            "xLabel": "Training points",
            "yLabel": "Unseen accuracy (%)",
            "series": [
                {
                    "label": result.name,
                    "color": COLORS[index % len(COLORS)],
                    "points": result.learning,
                }
                for index, result in enumerate(results)
            ],
        },
        {
            "id": "leaderboard",
            "kind": "table",
            "title": "Model leaderboard",
            "caption": (
                "Select a heading to sort. A smaller gap with a high unseen "
                "score is usually a healthier result."
            ),
            "columns": ["Model", "Unseen %", "Training %", "Gap (pp)", "Mistakes"],
            "rows": [
                [
                    result.name,
                    round(result.test_score, 1),
                    round(result.train_score, 1),
                    round(result.train_score - result.test_score, 1),
                    int(np.sum(result.predictions != labels)),
                ]
                for result in results
            ],
        },
        {
            "id": "report",
            "kind": "markdown",
            "title": "What changed?",
            "caption": (
                "All models share the same data, feature recipe, and evaluation split."
            ),
            "text": report,
        },
    ]


def show(panels: list[dict]) -> None:
    print(
        "SETTA_DISPLAY " + json.dumps({"version": 1, "panels": panels}, allow_nan=False)
    )
