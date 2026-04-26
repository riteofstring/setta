#!/usr/bin/env python3

import argparse
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Strip transient uv.lock options that should not be committed."
    )
    parser.add_argument("lockfile", type=Path, help="Path to uv.lock.")
    return parser.parse_args()


def _is_options_entry(line: str) -> bool:
    stripped = line.strip()
    return stripped == "" or "=" in line


def _consume_options_section(lines: list[str], start_idx: int) -> tuple[list[str], int]:
    idx = start_idx
    section_lines: list[str] = []
    while idx < len(lines) and _is_options_entry(lines[idx]):
        section_lines.append(lines[idx])
        idx += 1
    return section_lines, idx


def _is_transient_options_section(section_lines: list[str]) -> bool:
    non_blank = [line.strip() for line in section_lines if line.strip()]
    return bool(non_blank) and all(
        line.startswith("exclude-newer =") for line in non_blank
    )


def _trim_trailing_blank_lines(lines: list[str]) -> None:
    while lines and lines[-1].strip() == "":
        lines.pop()


def _skip_blank_lines(lines: list[str], start_idx: int) -> int:
    idx = start_idx
    while idx < len(lines) and lines[idx].strip() == "":
        idx += 1
    return idx


def _append_section_gap(lines: list[str]) -> None:
    if not lines:
        return
    if not lines[-1].endswith("\n"):
        lines[-1] = f"{lines[-1]}\n"
    lines.append("\n")


def normalize_lockfile_text(text: str) -> str:
    lines = text.splitlines(keepends=True)
    normalized: list[str] = []
    idx = 0

    while idx < len(lines):
        line = lines[idx]
        idx += 1
        if line.strip() != "[options]":
            normalized.append(line)
            continue

        section_lines, idx = _consume_options_section(lines, idx)
        if _is_transient_options_section(section_lines):
            _trim_trailing_blank_lines(normalized)
            idx = _skip_blank_lines(lines, idx)
            _append_section_gap(normalized)
            continue

        normalized.append(line)
        normalized.extend(section_lines)

    return "".join(normalized)


def main() -> int:
    args = parse_args()
    normalized = normalize_lockfile_text(args.lockfile.read_text(encoding="utf-8"))
    args.lockfile.write_text(normalized, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
