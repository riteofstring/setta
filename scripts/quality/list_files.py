#!/usr/bin/env python
from __future__ import annotations

import argparse
import fnmatch
import subprocess
import sys
from functools import cache
from pathlib import Path
from typing import Any

import yaml

ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG_PATH = ROOT_DIR / "quality.paths.yaml"
SCHEMA_VERSION = 1
CATEGORIES = (
    "python",
    "frontend-eslint",
    "frontend-boundary",
    "frontend-guardrail",
    "go",
)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="List files covered by Setta quality checks."
    )
    parser.add_argument("--config", default=str(DEFAULT_CONFIG_PATH))
    parser.add_argument("--category", choices=CATEGORIES, required=True)
    parser.add_argument(
        "--source",
        choices=("stdin", "tracked"),
        default="tracked",
        help="Read candidate paths from stdin or from git ls-files.",
    )
    args = parser.parse_args()

    config_path = Path(args.config).resolve(strict=False)
    config = load_config(config_path)
    paths = read_input_paths(args.source)

    for path in filter_paths(config, args.category, paths):
        print(path)
    return 0


def load_config(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"Quality path config not found: {path}")
    with path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    if not isinstance(data, dict):
        raise TypeError(f"Quality path config must be a mapping: {path}")
    schema_version = data.get("schema_version")
    if schema_version != SCHEMA_VERSION:
        raise ValueError(
            f"Unsupported quality path config schema_version {schema_version!r}; "
            f"expected {SCHEMA_VERSION}."
        )
    return data


def read_input_paths(source: str) -> list[str]:
    if source == "stdin":
        return sys.stdin.read().splitlines()

    result = subprocess.run(
        ["git", "ls-files"],
        cwd=ROOT_DIR,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.splitlines()


def filter_paths(
    config: dict[str, Any],
    category: str,
    paths: list[str],
) -> list[str]:
    seen: set[str] = set()
    matched: list[str] = []
    for raw_path in paths:
        path = normalize_path(raw_path)
        if not path or path in seen:
            continue
        seen.add(path)
        if not (ROOT_DIR / path).is_file():
            continue
        if is_category_candidate(config, category, path):
            matched.append(path)
    return matched


def normalize_path(path: str) -> str:
    cleaned = path.strip().removeprefix("./").replace("\\", "/")
    candidate = Path(cleaned)
    if candidate.is_absolute():
        try:
            return candidate.resolve(strict=False).relative_to(ROOT_DIR).as_posix()
        except ValueError:
            return cleaned
    return cleaned


def is_category_candidate(config: dict[str, Any], category: str, path: str) -> bool:
    if category == "python":
        return matches_language_section(path, mapping(config, "python"))
    if category == "go":
        return matches_language_section(path, mapping(config, "go"))
    if category.startswith("frontend-"):
        frontend = mapping(config, "frontend")
        section_name = category.removeprefix("frontend-")
        section = mapping(frontend, section_name)
        extra_excludes = (
            string_list(frontend, "generated_globs")
            if bool(section.get("exclude_generated", False))
            else []
        )
        return matches_path_section(path, section, extra_excludes=extra_excludes)
    raise ValueError(f"Unknown quality category: {category}")


def matches_language_section(path: str, section: dict[str, Any]) -> bool:
    extra_excludes = string_list(section, "generated_globs")
    return matches_path_section(path, section, extra_excludes=extra_excludes)


def matches_path_section(
    path: str,
    section: dict[str, Any],
    *,
    extra_excludes: list[str],
) -> bool:
    include_globs = string_list(section, "include_globs")
    if include_globs and not any(
        path_matches(path, pattern) for pattern in include_globs
    ):
        return False

    extensions = string_list(section, "extensions")
    if extensions and not path.endswith(tuple(extensions)):
        return False

    exclude_globs = string_list(section, "exclude_globs") + extra_excludes
    if any(path_matches(path, pattern) for pattern in exclude_globs):
        return False

    return True


def mapping(data: dict[str, Any], key: str) -> dict[str, Any]:
    value = data.get(key, {})
    if not isinstance(value, dict):
        raise TypeError(f"Quality path config key {key!r} must be a mapping.")
    return value


def string_list(data: dict[str, Any], key: str) -> list[str]:
    value = data.get(key, [])
    if value is None:
        return []
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise TypeError(f"Quality path config key {key!r} must be a list of strings.")
    return value


def path_matches(path: str, pattern: str) -> bool:
    path_parts = tuple(part for part in path.split("/") if part)
    pattern_parts = tuple(part for part in pattern.split("/") if part)

    @cache
    def match_from(path_index: int, pattern_index: int) -> bool:
        if pattern_index == len(pattern_parts):
            return path_index == len(path_parts)

        pattern_part = pattern_parts[pattern_index]
        if pattern_part == "**":
            return match_from(path_index, pattern_index + 1) or (
                path_index < len(path_parts)
                and match_from(path_index + 1, pattern_index)
            )

        return (
            path_index < len(path_parts)
            and fnmatch.fnmatchcase(path_parts[path_index], pattern_part)
            and match_from(path_index + 1, pattern_index + 1)
        )

    return match_from(0, 0)


if __name__ == "__main__":
    raise SystemExit(main())
