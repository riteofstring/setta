#!/usr/bin/env python
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import deadcode_common as common

ROOT_DIR = common.ROOT_DIR
run_command = common.run_command
resolve_generated_globs = common.resolve_generated_globs
relative_path = common.relative_path
normalize_tool_path = common.normalize_tool_path
config_string_list = common.config_string_list

GO_TOOLING_REFERENCE_ROOTS = (
    "scripts",
    "frontend/generation",
    "frontend/scripts",
    "docs/guides",
    "docs/reference",
)


def discover_go_tooling_mains(
    *,
    go_config: dict[str, Any],
    discovered_mains: list[str],
    production_mains: list[str],
) -> tuple[list[str], dict[str, list[str]], list[str], list[str]]:
    production_set = set(production_mains)
    discovered_set = set(discovered_mains)
    referenced_by_source = discover_go_tooling_main_references(discovered_set)
    referenced = {
        pkg
        for mains in referenced_by_source.values()
        for pkg in mains
        if pkg not in production_set
    }
    configured = set(config_string_list(go_config, "tooling_mains", []))
    warnings: list[str] = []

    unknown_configured = sorted(configured - discovered_set)
    if unknown_configured:
        warnings.append(
            "Configured Go tooling mains were not discovered as main packages: "
            + ", ".join(unknown_configured)
        )

    production_overlap = sorted(configured & production_set)
    if production_overlap:
        warnings.append(
            "Configured Go tooling mains overlap production mains and were ignored: "
            + ", ".join(production_overlap)
        )

    tooling_mains = sorted((referenced | configured) & discovered_set - production_set)
    unclassified_mains = sorted(discovered_set - production_set - set(tooling_mains))
    if unclassified_mains:
        warnings.append(
            "Discovered Go main packages are not classified as production or tooling roots: "
            + ", ".join(unclassified_mains)
        )

    tooling_root_sources = {
        source: [pkg for pkg in mains if pkg in tooling_mains]
        for source, mains in referenced_by_source.items()
        if any(pkg in tooling_mains for pkg in mains)
    }
    if configured:
        tooling_root_sources["config_override"] = sorted(configured & discovered_set)

    return tooling_mains, tooling_root_sources, unclassified_mains, warnings


def discover_go_tooling_main_references(
    discovered_mains: set[str],
) -> dict[str, list[str]]:
    references_by_source: dict[str, list[str]] = {}
    for root in GO_TOOLING_REFERENCE_ROOTS:
        source_root = ROOT_DIR / root
        if not source_root.exists():
            continue
        for path in sorted(source_root.rglob("*")):
            if not path.is_file() or should_skip_go_tooling_reference_file(path):
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                continue
            references = [
                reference
                for reference in discover_go_package_references_in_text(text)
                if reference in discovered_mains
            ]
            if references:
                references_by_source[relative_path(path)] = sorted(set(references))
    return dict(sorted(references_by_source.items()))


def should_skip_go_tooling_reference_file(path: Path) -> bool:
    return any(
        part
        in {
            ".git",
            ".venv",
            "__pycache__",
            "dist",
            "node_modules",
            "reports",
        }
        for part in path.parts
    )


def discover_go_package_references_in_text(text: str) -> list[str]:
    matches = set(re.findall(r"\./cmd/[A-Za-z0-9._-]+", text))
    matches.update(re.findall(r"\./scripts/[A-Za-z0-9._/-]+\.go", text))
    packages: set[str] = set()
    for match in matches:
        if match.endswith(".go"):
            parent = Path(match).parent.as_posix()
            packages.add(parent if parent.startswith("./") else f"./{parent}")
        else:
            packages.add(match.rstrip("/"))
    return sorted(packages)


def go_main_package_source_path(main_pkg: str) -> str:
    package_dir = ROOT_DIR / main_pkg.removeprefix("./")
    main_go = package_dir / "main.go"
    if main_go.exists():
        return relative_path(main_go)
    go_files = sorted(
        path
        for path in package_dir.glob("*.go")
        if path.is_file() and not path.name.endswith("_test.go")
    )
    for path in go_files:
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if re.search(r"\bfunc\s+main\s*\(", text):
            return relative_path(path)
    if go_files:
        return relative_path(go_files[0])
    return relative_path(package_dir)
