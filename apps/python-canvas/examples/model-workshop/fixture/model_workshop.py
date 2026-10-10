from __future__ import annotations

import shutil
import sys
from dataclasses import dataclass

import numpy as np
from numpy.typing import ArrayLike, NDArray
from sklearn.base import clone
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline


@dataclass(frozen=True)
class Result:
    model: Pipeline
    points: NDArray
    labels: NDArray
    predictions: NDArray
    train_accuracy: float
    test_accuracy: float


def evaluate(model: Pipeline, data: tuple[ArrayLike, ArrayLike]) -> Result:
    points, labels = (np.asarray(part) for part in data)
    train_x, test_x, train_y, test_y = train_test_split(
        points, labels, test_size=0.3, random_state=42, stratify=labels
    )
    fitted = clone(model).fit(train_x, train_y)
    predictions = fitted.predict(test_x)
    return Result(
        fitted,
        test_x,
        test_y,
        predictions,
        float(fitted.score(train_x, train_y)),
        float(np.mean(predictions == test_y)),
    )


def decision_map(result: Result, width: int, height: int, color: bool) -> str:
    low = result.points.min(axis=0) - 0.3
    high = result.points.max(axis=0) + 0.3
    grid_x, grid_y = np.meshgrid(
        np.linspace(low[0], high[0], width),
        np.linspace(high[1], low[1], height),
    )
    regions = result.model.predict(np.column_stack([grid_x.ravel(), grid_y.ravel()]))
    regions = regions.reshape(height, width)
    markers: dict[tuple[int, int], tuple[int, bool]] = {}
    coordinates = np.rint(
        (result.points - low) / (high - low) * [width - 1, height - 1]
    )
    for cell, label, prediction in zip(
        coordinates.astype(int), result.labels, result.predictions, strict=True
    ):
        location = (height - 1 - int(cell[1]), int(cell[0]))
        incorrect = bool(label != prediction)
        if location not in markers or incorrect:
            markers[location] = (int(label), incorrect)
    rows = []
    for row_index, row in enumerate(regions):
        cells = []
        for column, region in enumerate(row):
            marker = markers.get((row_index, column))
            symbol = ("A" if marker[0] == 0 else "B") if marker else " "
            if marker and marker[1]:
                symbol = "\u00d7" if color else "x"
            if color:
                background = "20;61;70" if region == 0 else "76;39;62"
                foreground = (
                    "105;236;219" if marker and marker[0] == 0 else "255;171;199"
                )
                if marker and marker[1]:
                    foreground = "255;255;255"
                cells.append(f"\033[48;2;{background}m\033[38;2;{foreground}m{symbol}")
            else:
                cells.append(symbol if marker else ("·" if region == 0 else ":"))
        rows.append("".join(cells) + ("\033[0m" if color else ""))
    return "\n".join(rows)


def show(model: Pipeline, data: tuple[ArrayLike, ArrayLike]) -> Result:
    result = evaluate(model, data)
    columns, lines = shutil.get_terminal_size((76, 24))
    width = max(24, min(68, columns - 2))
    height = max(5, min(16, lines - 8))
    color = sys.stdout.isatty()
    if color:
        print("\033[2J\033[H", end="")
    print("MODEL WORKSHOP  ·  Can your recipe follow the moons?")
    print(" → ".join(type(step).__name__ for _, step in result.model.steps))
    print(decision_map(result, width, height, color))
    print(
        "A / B: unseen samples · \u00d7: mistake · background: model's class"
        if color
        else "A / B: unseen samples · x: mistake · · / :: model's class"
    )
    mistakes = int(np.sum(result.predictions != result.labels))
    print(
        f"Unseen: {result.test_accuracy:.1%}  |  Training: {result.train_accuracy:.1%}"
        f"  |  {mistakes}/{len(result.labels)} mistakes"
    )
    print("Change one ingredient, then Run. Keep the seed for repeatable data.")
    return result
