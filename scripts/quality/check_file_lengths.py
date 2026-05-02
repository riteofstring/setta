#!/usr/bin/env python
from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import list_files

ROOT_DIR = list_files.ROOT_DIR
DEFAULT_CONFIG_PATH = list_files.DEFAULT_CONFIG_PATH


@dataclass(frozen=True)
class FileLengthCheck:
    language: str
    category: str
    max_lines_path: tuple[str, ...]


CHECKS = (
    FileLengthCheck(
        "Python",
        "python",
        ("python", "file_length", "max_lines"),
    ),
    FileLengthCheck(
        "TypeScript",
        "frontend-file-length",
        ("frontend", "file_length", "max_lines"),
    ),
    FileLengthCheck(
        "Go",
        "go",
        ("go", "file_length", "max_lines"),
    ),
)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Fail when supported non-generated source files exceed length limits."
    )
    parser.add_argument("--config", default=str(DEFAULT_CONFIG_PATH))
    parser.add_argument(
        "--source",
        choices=("stdin", "tracked"),
        default="tracked",
        help="Read candidate paths from stdin or from git ls-files.",
    )
    parser.add_argument(
        "--paths-file",
        help="Read candidate paths from this file instead of --source.",
    )
    args = parser.parse_args()

    config_path = Path(args.config).resolve(strict=False)
    config = list_files.load_config(config_path)
    paths = read_candidate_paths(args.paths_file, args.source)
    failures = collect_failures(config, paths)

    if not failures:
        return 0

    print("File length limit exceeded:")
    for failure in failures:
        print(
            "  {language} {path}: {line_count} lines (max {max_lines})".format(
                **failure
            )
        )
    return 1


def read_candidate_paths(paths_file: str | None, source: str) -> list[str]:
    if paths_file is None:
        return list_files.read_input_paths(source)
    return Path(paths_file).read_text(encoding="utf-8").splitlines()


def collect_failures(
    config: dict[str, Any],
    candidate_paths: list[str],
) -> list[dict[str, Any]]:
    failures: list[dict[str, Any]] = []
    for check in CHECKS:
        max_lines = config_positive_integer(config, check.max_lines_path)
        for relative_path in list_files.filter_paths(
            config, check.category, candidate_paths
        ):
            line_count = count_lines(ROOT_DIR / relative_path)
            if line_count <= max_lines:
                continue
            failures.append(
                {
                    "language": check.language,
                    "path": relative_path,
                    "line_count": line_count,
                    "max_lines": max_lines,
                }
            )
    failures.sort(key=lambda failure: (-failure["line_count"], failure["path"]))
    return failures


def config_positive_integer(config: dict[str, Any], path: tuple[str, ...]) -> int:
    value: Any = config
    for key in path:
        if not isinstance(value, dict):
            raise TypeError(f"Quality config key {'.'.join(path)!r} must be present.")
        value = value.get(key)
    if not isinstance(value, int) or value < 1:
        raise TypeError(
            f"Quality config key {'.'.join(path)!r} must be a positive integer."
        )
    return value


def count_lines(path: Path) -> int:
    text = path.read_text(encoding="utf-8")
    if not text:
        return 0
    return len(text.splitlines())


if __name__ == "__main__":
    raise SystemExit(main())
