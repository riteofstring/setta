from bisect import bisect_right
from typing import Iterable


def build_line_index(text: str) -> tuple[list[int], list[int]]:
    line_starts = [0]
    line_lengths: list[int] = []
    last_start = 0
    for idx, ch in enumerate(text):
        if ch == "\n":
            line_lengths.append(idx - last_start)
            line_starts.append(idx + 1)
            last_start = idx + 1
    line_lengths.append(len(text) - last_start)
    return line_starts, line_lengths


def position_to_line_col(
    text: str, position: int, line_starts: list[int] | None = None
):
    if position < 0 or position > len(text):
        raise ValueError

    if line_starts is None:
        line_starts, _ = build_line_index(text)

    line = bisect_right(line_starts, position) - 1
    col = position - line_starts[line]
    return line, col


def line_col_to_position_batch(
    text: str,
    line_col_pairs: Iterable[tuple[int, int]],
    line_starts: list[int] | None = None,
    line_lengths: list[int] | None = None,
):
    if line_starts is None or line_lengths is None:
        line_starts, line_lengths = build_line_index(text)

    results: list[int] = []
    for line, col in line_col_pairs:
        if line < 0 or line >= len(line_lengths) or col < 0:
            raise ValueError
        else:
            position = line_starts[line] + min(col, line_lengths[line])
            results.append(position)

    return results
