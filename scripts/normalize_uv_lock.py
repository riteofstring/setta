#!/usr/bin/env python3

import argparse
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Strip transient uv.lock options that should not be committed."
    )
    parser.add_argument("lockfile", type=Path, help="Path to uv.lock.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    lines = args.lockfile.read_text(encoding="utf-8").splitlines(keepends=True)
    normalized: list[str] = []
    idx = 0

    while idx < len(lines):
        if lines[idx].strip() != "[options]":
            normalized.append(lines[idx])
            idx += 1
            continue

        section_lines: list[str] = []
        idx += 1
        while idx < len(lines) and (lines[idx].strip() == "" or "=" in lines[idx]):
            section_lines.append(lines[idx])
            idx += 1

        non_blank = [line.strip() for line in section_lines if line.strip()]
        if non_blank and all(line.startswith("exclude-newer =") for line in non_blank):
            while normalized and normalized[-1].strip() == "":
                normalized.pop()
            while idx < len(lines) and lines[idx].strip() == "":
                idx += 1
            if normalized and not normalized[-1].endswith("\n"):
                normalized[-1] = f"{normalized[-1]}\n"
            if normalized:
                normalized.append("\n")
            continue

        normalized.append("[options]\n")
        normalized.extend(section_lines)

    args.lockfile.write_text("".join(normalized), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
