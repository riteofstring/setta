#!/usr/bin/env python
from __future__ import annotations

import json
import re
from collections import deque
from typing import TYPE_CHECKING, Any

import deadcode_common as common

if TYPE_CHECKING:
    from pathlib import Path

ROOT_DIR = common.ROOT_DIR
SCHEMA_VERSION = common.SCHEMA_VERSION
DEFAULT_FRONTEND_LINT_ROOTS = ["src"]
FRONTEND_TEST_MARKERS = (".test.", ".spec.", ".stories.")
FRONTEND_TEST_PATH_PARTS = ("/testUtils/", "/tests/", "/__tests__/")
FRONTEND_CODE_EXTENSIONS = (
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".mts",
    ".cts",
)
FRONTEND_STATIC_IMPORT_RE = re.compile(
    r"""(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["'](?P<module>[^"']+)["']""",
    re.MULTILINE,
)
FRONTEND_DYNAMIC_IMPORT_RE = re.compile(
    r"""import\(\s*(?:/\*.*?\*/\s*)?["'](?P<module>[^"']+)["']\s*\)""",
    re.MULTILINE | re.DOTALL,
)

config_string_list = common.config_string_list
resolve_generated_globs = common.resolve_generated_globs
run_command = common.run_command
command_display = common.command_display
write_json = common.write_json
relative_path = common.relative_path
normalize_tool_path = common.normalize_tool_path
matches_any_glob = common.matches_any_glob
dedupe_findings = common.dedupe_findings


def build_frontend_reports(
    config: dict[str, Any],
    output_dir: Path,
    generated_at: str,
) -> dict[str, Any]:
    frontend_config = config.get("frontend", {})
    app_roots = list(frontend_config.get("app_roots", ["frontend/src/index.tsx"]))
    lint_roots = config_string_list(
        frontend_config, "lint_roots", DEFAULT_FRONTEND_LINT_ROOTS
    )
    package_roots = config_string_list(frontend_config, "package_roots", [])
    generated_globs = resolve_generated_globs("frontend", frontend_config, [])
    frontend_scope_support = build_frontend_scope_support(app_roots)
    warnings = [
        f"Configured frontend app root was not found: {root}"
        for root in app_roots
        if not (ROOT_DIR / root).exists()
    ]

    knip_prod_command = [
        "pnpm",
        "-C",
        "frontend",
        "exec",
        "knip",
        "--production",
        "--reporter",
        "json",
        "--no-exit-code",
    ]
    knip_prod_completed = run_command(knip_prod_command)
    knip_prod_payload = json.loads(knip_prod_completed.stdout or "{}")
    knip_prod_findings = normalize_knip_findings(
        knip_prod_payload,
        generated_globs,
        scope="prod",
        issue_label="knip --production",
        root_prefix="frontend",
        bucket="prod-dead",
    )
    knip_prod_report = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at,
        "language": "frontend",
        "lane": "reachability",
        "tool": "knip",
        "scope": "prod",
        "commands": [command_display(knip_prod_command)],
        "app_roots": app_roots,
        "warnings": warnings,
        "limitations": [
            "Frontend production reachability excludes known test-only paths and compares against Knip's full graph for non-production evidence.",
            "Frontend test/tooling classification uses a repo-local import graph as supporting evidence for internal files.",
        ],
        "findings": knip_prod_findings,
    }
    knip_prod_path = output_dir / "frontend-prod.json"
    write_json(knip_prod_path, knip_prod_report)

    knip_full_command = [
        "pnpm",
        "-C",
        "frontend",
        "exec",
        "knip",
        "--reporter",
        "json",
        "--no-exit-code",
    ]
    knip_full_completed = run_command(knip_full_command)
    knip_full_payload = json.loads(knip_full_completed.stdout or "{}")
    knip_full_findings = normalize_knip_findings(
        knip_full_payload,
        generated_globs,
        scope="all",
        issue_label="knip full graph",
        root_prefix="frontend",
        bucket="prod-dead",
    )
    knip_full_report = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at,
        "language": "frontend",
        "lane": "reachability",
        "tool": "knip",
        "scope": "all",
        "commands": [command_display(knip_full_command)],
        "app_roots": app_roots,
        "warnings": warnings,
        "limitations": [
            "Frontend full-graph reachability reflects Knip's non-production roots collectively; package.json and dependency findings may still remain combined non-production evidence.",
        ],
        "findings": knip_full_findings,
    }
    knip_full_path = output_dir / "frontend-all.json"
    write_json(knip_full_path, knip_full_report)

    package_reports, package_findings = build_frontend_package_reports(
        output_dir=output_dir,
        generated_at=generated_at,
        package_roots=package_roots,
        generated_globs=generated_globs,
    )

    eslint_command = [
        "pnpm",
        "-C",
        "frontend",
        "exec",
        "eslint",
        *lint_roots,
        "--ext",
        ".js,.jsx,.ts,.tsx",
        "--format",
        "json",
        "--rule",
        "no-unused-vars: off",
        "--rule",
        '@typescript-eslint/no-unused-vars: ["error", {"argsIgnorePattern":"^_","varsIgnorePattern":"^_"}]',
    ]
    eslint_completed = run_command(eslint_command, allowed_exit_codes={0, 1})
    eslint_payload = json.loads(eslint_completed.stdout or "[]")
    eslint_findings = normalize_frontend_eslint_findings(
        eslint_payload, generated_globs
    )
    eslint_report = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at,
        "language": "frontend",
        "lane": "lint-unused",
        "tool": "eslint",
        "commands": [command_display(eslint_command)],
        "app_roots": app_roots,
        "lint_roots": lint_roots,
        "warnings": warnings,
        "limitations": [
            "Frontend lint-unused uses a focused ESLint no-unused-vars pass across configured app and SDK roots because repo-wide tsc currently has unrelated type errors.",
        ],
        "findings": eslint_findings,
    }
    eslint_path = output_dir / "frontend-lint-unused.json"
    write_json(eslint_path, eslint_report)

    reachability_findings = aggregate_frontend_findings(
        prod_findings=knip_prod_findings,
        full_findings=knip_full_findings,
        scope_support=frontend_scope_support,
    )
    findings = dedupe_findings(
        reachability_findings + package_findings + eslint_findings
    )
    limitations = (
        list(knip_prod_report["limitations"])
        + list(knip_full_report["limitations"])
        + [
            "Frontend package reachability uses per-package Knip directory runs for configured SDK and plugin package roots."
        ]
        + list(eslint_report["limitations"])
    )
    report_paths = [
        {"language": "frontend", "path": relative_path(knip_prod_path)},
        {"language": "frontend", "path": relative_path(knip_full_path)},
        *package_reports,
        {"language": "frontend", "path": relative_path(eslint_path)},
    ]
    return {
        "findings": findings,
        "warnings": warnings,
        "limitations": limitations,
        "report_paths": report_paths,
        "tool_status": {
            "reachability": "ok",
            "lint_unused": "ok",
            "app_roots": app_roots,
            "lint_roots": lint_roots,
            "package_roots": package_roots,
            "test_roots": frontend_scope_support["test_roots"],
            "tooling_roots": frontend_scope_support["tooling_roots"],
            "test_reachable_file_count": len(
                frontend_scope_support["reachable_files"]["test"]
            ),
            "tooling_reachable_file_count": len(
                frontend_scope_support["reachable_files"]["tooling"]
            ),
        },
    }


def build_frontend_package_reports(
    *,
    output_dir: Path,
    generated_at: str,
    package_roots: list[str],
    generated_globs: list[str],
) -> tuple[list[dict[str, str]], list[dict[str, Any]]]:
    report_paths: list[dict[str, str]] = []
    findings: list[dict[str, Any]] = []

    for package_root in package_roots:
        if not (ROOT_DIR / package_root / "package.json").exists():
            continue
        command = [
            "pnpm",
            "-C",
            "frontend",
            "exec",
            "knip",
            "--directory",
            frontend_knip_directory_arg(package_root),
            "--reporter",
            "json",
            "--no-exit-code",
        ]
        completed = run_command(command)
        payload = json.loads(completed.stdout or "{}")
        package_findings = normalize_knip_findings(
            payload,
            generated_globs,
            scope="package",
            issue_label=f"knip package graph ({package_root})",
            root_prefix=package_root,
            bucket="package-dead",
        )
        findings.extend(package_findings)

        report_name = package_root.replace("/", "-") + "-deadcode.json"
        report_path = output_dir / report_name
        write_json(
            report_path,
            {
                "schema_version": SCHEMA_VERSION,
                "generated_at": generated_at,
                "language": "frontend",
                "lane": "reachability",
                "tool": "knip",
                "scope": "package",
                "package_root": package_root,
                "commands": [command_display(command)],
                "warnings": [],
                "limitations": [
                    "Package reachability reflects Knip's graph for this standalone frontend package root."
                ],
                "findings": package_findings,
            },
        )
        report_paths.append(
            {"language": "frontend", "path": relative_path(report_path)}
        )

    return report_paths, dedupe_findings(findings)


def frontend_knip_directory_arg(package_root: str) -> str:
    if package_root == "frontend":
        return "."
    frontend_prefix = "frontend/"
    if package_root.startswith(frontend_prefix):
        return package_root.removeprefix(frontend_prefix)
    return f"../{package_root}"


def normalize_knip_findings(
    payload: dict[str, Any],
    generated_globs: list[str],
    *,
    scope: str,
    issue_label: str,
    root_prefix: str,
    bucket: str,
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []

    for file_path in payload.get("files", []):
        path = normalize_tool_path(f"{root_prefix}/{file_path}")
        if (
            not path
            or matches_any_glob(path, generated_globs)
            or is_frontend_test_path(path)
        ):
            continue
        findings.append(
            {
                "language": "frontend",
                "lane": "reachability",
                "bucket": bucket,
                "tool": "knip",
                "confidence": "medium",
                "scope": scope,
                "path": path,
                "line": None,
                "column": None,
                "symbol": None,
                "issue_type": "file",
                "evidence": [f"reported by {issue_label} as an unused file"],
            }
        )

    for issue in payload.get("issues", []):
        file_path = normalize_tool_path(f"{root_prefix}/{issue.get('file', '')}")
        if (
            not file_path
            or matches_any_glob(file_path, generated_globs)
            or is_frontend_test_path(file_path)
        ):
            continue
        for issue_type, items in issue.items():
            if issue_type == "file" or not isinstance(items, list):
                continue
            for item in items:
                if not isinstance(item, dict):
                    continue
                findings.append(
                    {
                        "language": "frontend",
                        "lane": "reachability",
                        "bucket": bucket,
                        "tool": "knip",
                        "confidence": "medium",
                        "scope": scope,
                        "path": file_path,
                        "line": item.get("line"),
                        "column": item.get("col"),
                        "symbol": item.get("name"),
                        "issue_type": issue_type,
                        "evidence": [
                            f"reported by {issue_label} as unused {issue_type.rstrip('s')}"
                        ],
                    }
                )
    return dedupe_findings(findings)


def aggregate_frontend_findings(
    *,
    prod_findings: list[dict[str, Any]],
    full_findings: list[dict[str, Any]],
    scope_support: dict[str, Any],
) -> list[dict[str, Any]]:
    aggregated: list[dict[str, Any]] = []
    full_keys = {frontend_reachability_identity(finding) for finding in full_findings}
    test_reachable = scope_support["reachable_files"]["test"]
    tooling_reachable = scope_support["reachable_files"]["tooling"]

    for finding in prod_findings:
        identity = frontend_reachability_identity(finding)
        reachable_from: list[str] = []
        evidence = ["dead in production frontend roots"]
        if identity not in full_keys:
            if finding["path"] in test_reachable:
                reachable_from.append("test")
                evidence.append("reachable from frontend test roots")
            if finding["path"] in tooling_reachable:
                reachable_from.append("tooling")
                evidence.append("reachable from frontend tooling roots")
            if not reachable_from:
                reachable_from.append("non-prod")
                evidence.append(
                    "reachable when frontend non-production roots are included"
                )
        else:
            evidence.append("dead when frontend non-production roots are included")

        bucket = "dead" if not reachable_from else "prod-dead"
        confidence = "high" if bucket == "dead" else "medium"
        aggregated.append(
            {
                "language": "frontend",
                "lane": "reachability",
                "bucket": bucket,
                "tool": "knip",
                "confidence": confidence,
                "root_scope": "prod",
                "path": finding["path"],
                "line": finding["line"],
                "column": finding["column"],
                "symbol": finding["symbol"],
                "issue_type": finding.get("issue_type"),
                "reachable_from": reachable_from,
                "evidence": evidence + list(finding.get("evidence", [])),
            }
        )
    return dedupe_findings(aggregated)


def frontend_reachability_identity(finding: dict[str, Any]) -> tuple[Any, ...]:
    return (
        finding.get("path"),
        finding.get("line"),
        finding.get("column"),
        finding.get("symbol"),
        finding.get("issue_type"),
    )


def build_frontend_scope_support(app_roots: list[str]) -> dict[str, Any]:
    graph = build_frontend_import_graph()
    test_roots = discover_frontend_test_roots()
    tooling_roots = discover_frontend_tooling_roots()
    return {
        "app_roots": sorted(dict.fromkeys(app_roots)),
        "test_roots": test_roots,
        "tooling_roots": tooling_roots,
        "reachable_files": {
            "test": walk_frontend_graph(graph, test_roots),
            "tooling": walk_frontend_graph(graph, tooling_roots),
        },
    }


def build_frontend_import_graph() -> dict[str, set[str]]:
    graph: dict[str, set[str]] = {}
    for path in iter_frontend_code_files():
        relative = relative_path(path)
        graph[relative] = resolve_frontend_imports_for_file(path)
    return graph


def iter_frontend_code_files() -> list[Path]:
    files: list[Path] = []
    frontend_root = ROOT_DIR / "frontend"
    for path in frontend_root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in {"node_modules", "dist"} for part in path.parts):
            continue
        if path.suffix not in FRONTEND_CODE_EXTENSIONS:
            continue
        files.append(path)
    return sorted(files)


def discover_frontend_test_roots() -> list[str]:
    roots: list[str] = []
    for path in iter_frontend_code_files():
        relative = relative_path(path)
        if relative == "frontend/playwright.config.ts" or is_frontend_test_path(
            relative
        ):
            roots.append(relative)
    return sorted(dict.fromkeys(roots))


def discover_frontend_tooling_roots() -> list[str]:
    roots: list[str] = []
    for path in iter_frontend_code_files():
        relative = relative_path(path)
        if (
            relative == "frontend/vite.config.ts"
            or relative.startswith("frontend/scripts/")
            or relative.startswith("frontend/generation/")
        ):
            roots.append(relative)
    return sorted(dict.fromkeys(roots))


def walk_frontend_graph(graph: dict[str, set[str]], roots: list[str]) -> set[str]:
    visited: set[str] = set()
    queue: deque[str] = deque(root for root in roots if root in graph)
    while queue:
        current = queue.popleft()
        if current in visited:
            continue
        visited.add(current)
        for dependency in graph.get(current, set()):
            if dependency not in visited:
                queue.append(dependency)
    return visited


def resolve_frontend_imports_for_file(path: Path) -> set[str]:
    text = path.read_text(encoding="utf-8")
    modules = {
        match.group("module")
        for match in FRONTEND_STATIC_IMPORT_RE.finditer(text)
        if match.group("module")
    }
    modules.update(
        match.group("module")
        for match in FRONTEND_DYNAMIC_IMPORT_RE.finditer(text)
        if match.group("module")
    )
    resolved: set[str] = set()
    for module in modules:
        target = resolve_frontend_module_specifier(path, module)
        if target:
            resolved.add(target)
    return resolved


def resolve_frontend_module_specifier(
    source_path: Path, module_specifier: str
) -> str | None:
    if not module_specifier or module_specifier.startswith("node:"):
        return None

    if module_specifier.startswith("/src/"):
        base = ROOT_DIR / "frontend" / module_specifier.lstrip("/")
    elif module_specifier.startswith("./") or module_specifier.startswith("../"):
        base = (source_path.parent / module_specifier).resolve(strict=False)
    else:
        base = ROOT_DIR / "frontend" / "src" / module_specifier

    resolved = resolve_frontend_internal_module_path(base)
    if resolved is None:
        return None
    return relative_path(resolved)


def resolve_frontend_internal_module_path(base: Path) -> Path | None:
    for candidate in frontend_internal_module_candidates(base):
        if is_frontend_internal_code_file(candidate):
            return candidate
    return None


def frontend_internal_module_candidates(base: Path) -> list[Path]:
    candidates = [base]
    if base.suffix:
        candidates.extend(
            base.with_suffix(suffix) for suffix in FRONTEND_CODE_EXTENSIONS
        )
        return candidates

    for suffix in FRONTEND_CODE_EXTENSIONS:
        candidates.append(base.with_suffix(suffix))
        candidates.append(base / f"index{suffix}")
    return candidates


def is_frontend_internal_code_file(candidate: Path) -> bool:
    if not candidate.exists() or not candidate.is_file():
        return False
    if candidate.suffix not in FRONTEND_CODE_EXTENSIONS:
        return False
    try:
        candidate.relative_to(ROOT_DIR / "frontend")
    except ValueError:
        return False
    return True


def normalize_frontend_eslint_findings(
    payload: list[dict[str, Any]],
    generated_globs: list[str],
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for file_result in payload:
        path = normalize_tool_path(file_result.get("filePath", ""))
        if (
            not path
            or matches_any_glob(path, generated_globs)
            or is_frontend_test_path(path)
        ):
            continue
        for message in file_result.get("messages", []):
            if message.get("ruleId") != "@typescript-eslint/no-unused-vars":
                continue
            findings.append(
                {
                    "language": "frontend",
                    "lane": "lint-unused",
                    "bucket": "lint-unused",
                    "tool": "eslint",
                    "confidence": "high",
                    "path": path,
                    "line": int(message.get("line", 0)),
                    "column": int(message.get("column", 0)),
                    "symbol": None,
                    "code": message.get("ruleId"),
                    "message": message.get("message"),
                    "evidence": [message.get("message", "")],
                }
            )
    return dedupe_findings(findings)


def is_frontend_test_path(path: str) -> bool:
    return any(marker in path for marker in FRONTEND_TEST_MARKERS) or any(
        marker in path for marker in FRONTEND_TEST_PATH_PARTS
    )
