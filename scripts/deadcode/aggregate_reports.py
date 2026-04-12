#!/usr/bin/env python
from __future__ import annotations

import argparse
import fnmatch
import json
import os
import re
import subprocess
import sys
import tempfile
from collections import Counter
from datetime import datetime, timezone
from importlib import metadata
from pathlib import Path
from typing import Any

import yaml

ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG_PATH = ROOT_DIR / "deadcode.overrides.yaml"
DEFAULT_OUTPUT_DIR = ROOT_DIR / "reports" / "deadcode"
SCHEMA_VERSION = 1
GO_GENERATED_FALLBACK_GLOBS = ["**/*_gen.go"]
FRONTEND_TEST_MARKERS = (".test.", ".spec.", ".stories.")
FRONTEND_TEST_PATH_PARTS = ("/testUtils/", "/tests/", "/__tests__/")
PYTHON_UNUSED_RULES = [
    "F401",
    "F822",
    "F841",
    "ARG001",
    "ARG002",
    "ARG003",
    "ARG004",
    "ARG005",
]
PYTHON_VULTURE_RE = re.compile(
    r"^(?P<path>.+?):(?P<line>\d+): unused (?P<kind>.+?) '(?P<symbol>.+)' \((?P<confidence>\d+)% confidence\)$"
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate dead code candidate reports.")
    parser.add_argument(
        "--config",
        default=str(DEFAULT_CONFIG_PATH),
        help="Path to dead code override config.",
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help="Directory for generated report JSON files.",
    )
    parser.add_argument(
        "--only",
        choices=("all", "go", "python", "frontend"),
        default="all",
        help="Generate reports for only one language family.",
    )
    args = parser.parse_args()

    config_path = Path(args.config).resolve(strict=False)
    output_dir = Path(args.output_dir).resolve(strict=False)
    output_dir.mkdir(parents=True, exist_ok=True)

    config = load_config(config_path)
    generated_at = now_iso()

    report_paths: list[dict[str, str]] = []
    findings: list[dict[str, Any]] = []
    warnings: list[str] = []
    limitations: list[str] = []
    tool_status: dict[str, dict[str, Any]] = {}

    if args.only in ("all", "go"):
        go_result = build_go_reports(config, output_dir, generated_at)
        report_paths.extend(go_result["report_paths"])
        findings.extend(go_result["findings"])
        warnings.extend(go_result["warnings"])
        limitations.extend(go_result["limitations"])
        tool_status["go"] = go_result["tool_status"]

    if args.only in ("all", "python"):
        python_result = build_python_reports(config, output_dir, generated_at)
        report_paths.extend(python_result["report_paths"])
        findings.extend(python_result["findings"])
        warnings.extend(python_result["warnings"])
        limitations.extend(python_result["limitations"])
        tool_status["python"] = python_result["tool_status"]

    if args.only in ("all", "frontend"):
        frontend_result = build_frontend_reports(config, output_dir, generated_at)
        report_paths.extend(frontend_result["report_paths"])
        findings.extend(frontend_result["findings"])
        warnings.extend(frontend_result["warnings"])
        limitations.extend(frontend_result["limitations"])
        tool_status["frontend"] = frontend_result["tool_status"]

    findings = sorted(findings, key=sort_finding_key)
    report_paths = sorted(report_paths, key=lambda item: item["path"])
    warnings = sorted(dict.fromkeys(warnings))
    limitations = sorted(dict.fromkeys(limitations))

    aggregate = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at,
        "config_path": relative_path(config_path),
        "reports": report_paths,
        "tool_status": tool_status,
        "summary": build_summary(findings),
        "warnings": warnings,
        "limitations": limitations,
        "findings": findings,
    }
    write_json(output_dir / "aggregate.json", aggregate)
    return 0


def load_config(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"Dead code config not found: {path}")
    with path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    if not isinstance(data, dict):
        raise TypeError(f"Dead code config must be a mapping: {path}")
    return data


def build_go_reports(
    config: dict[str, Any],
    output_dir: Path,
    generated_at: str,
) -> dict[str, Any]:
    go_config = config.get("go", {})
    deadcode_version = go_config.get("deadcode_version", "v0.44.0")
    staticcheck_version = go_config.get("staticcheck_version", "2025.1.1")
    build_matrix = resolve_go_build_matrix(go_config.get("build_matrix"))
    production_mains = set(go_config.get("production_mains", ["./cmd/setta", "./cmd/setta-server"]))
    discovered_mains = discover_go_main_packages()
    tooling_mains = sorted(pkg for pkg in discovered_mains if pkg not in production_mains)
    generated_globs = list(go_config.get("generated_globs", GO_GENERATED_FALLBACK_GLOBS))

    warnings: list[str] = []
    limitations: list[str] = []
    report_paths: list[dict[str, str]] = []
    raw_prod_findings: list[dict[str, Any]] = []
    raw_test_findings: list[dict[str, Any]] = []
    raw_tooling_findings: list[dict[str, Any]] = []

    unknown_prod = sorted(pkg for pkg in production_mains if pkg not in discovered_mains)
    if unknown_prod:
        warnings.append(
            "Configured Go production mains were not discovered under cmd/: "
            + ", ".join(unknown_prod)
        )

    for report_name, scope, mains, include_tests in (
        ("go-prod.json", "prod", sorted(production_mains), False),
        ("go-test.json", "test", sorted(production_mains), True),
        ("go-tooling.json", "tooling", tooling_mains, False),
    ):
        raw_findings: list[dict[str, Any]] = []
        commands: list[list[str]] = []
        for build_config in build_matrix:
            if not mains:
                continue
            cmd = [
                str(ROOT_DIR / "scripts" / "go.sh"),
                "run",
                f"golang.org/x/tools/cmd/deadcode@{deadcode_version}",
                "-json",
            ]
            if include_tests:
                cmd.append("-test")
            tags = build_config.get("tags", [])
            if tags:
                cmd.extend(["-tags", ",".join(tags)])
            cmd.extend(mains)
            env = os.environ.copy()
            env["GOOS"] = build_config["goos"]
            env["GOARCH"] = build_config["goarch"]
            completed = run_command(cmd, env=env)
            commands.append(cmd)
            packages = json.loads(completed.stdout or "[]")
            raw_findings.extend(
                normalize_go_deadcode_findings(
                    packages=packages,
                    scope=scope,
                    build_config=build_config,
                    generated_globs=generated_globs,
                )
            )

        deduped_findings = intersect_go_deadcode_findings(raw_findings, len(build_matrix))
        report = {
            "schema_version": SCHEMA_VERSION,
            "generated_at": generated_at,
            "language": "go",
            "lane": "reachability",
            "scope": scope,
            "commands": [command_display(cmd) for cmd in commands],
            "build_matrix": build_matrix,
            "roots": mains,
            "warnings": [],
            "limitations": [],
            "findings": deduped_findings,
        }
        path = output_dir / report_name
        write_json(path, report)
        report_paths.append({"language": "go", "path": relative_path(path)})
        if scope == "prod":
            raw_prod_findings = deduped_findings
        elif scope == "test":
            raw_test_findings = deduped_findings
        else:
            raw_tooling_findings = deduped_findings

    staticcheck_cmd = [
        str(ROOT_DIR / "scripts" / "go.sh"),
        "run",
        f"honnef.co/go/tools/cmd/staticcheck@{staticcheck_version}",
        "-checks=U1000",
        "-tests=false",
        "-f",
        "json",
        "-fail=none",
        "./cmd/...",
        "./internal/...",
    ]
    staticcheck_completed = run_command(staticcheck_cmd)
    staticcheck_findings = normalize_staticcheck_findings(
        output=staticcheck_completed.stdout,
        generated_globs=generated_globs,
    )
    staticcheck_report = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at,
        "language": "go",
        "lane": "lint-unused",
        "tool": "staticcheck",
        "commands": [command_display(staticcheck_cmd)],
        "warnings": [],
        "limitations": [],
        "findings": staticcheck_findings,
    }
    staticcheck_path = output_dir / "go-u1000.json"
    write_json(staticcheck_path, staticcheck_report)
    report_paths.append({"language": "go", "path": relative_path(staticcheck_path)})

    go_findings = aggregate_go_findings(
        prod_findings=raw_prod_findings,
        test_findings=raw_test_findings,
        tooling_findings=raw_tooling_findings,
        staticcheck_findings=staticcheck_findings,
    )

    if not tooling_mains:
        limitations.append("No Go tooling mains were discovered under cmd/ beyond configured production mains.")

    return {
        "findings": go_findings,
        "warnings": warnings,
        "limitations": limitations,
        "report_paths": report_paths,
        "tool_status": {
            "reachability": "ok",
            "lint_unused": "ok",
            "production_mains": sorted(production_mains),
            "tooling_mains": tooling_mains,
            "build_matrix": build_matrix,
        },
    }


def resolve_go_build_matrix(raw_matrix: Any) -> list[dict[str, Any]]:
    current_goos, current_goarch = current_go_platform()
    matrix = raw_matrix if isinstance(raw_matrix, list) and raw_matrix else [{}]
    resolved: list[dict[str, Any]] = []
    for entry in matrix:
        if not isinstance(entry, dict):
            continue
        goos = entry.get("goos", "env")
        goarch = entry.get("goarch", "env")
        tags = entry.get("tags", [])
        resolved.append(
            {
                "goos": current_goos if goos == "env" else str(goos),
                "goarch": current_goarch if goarch == "env" else str(goarch),
                "tags": list(tags) if isinstance(tags, list) else [],
            }
        )
    if not resolved:
        resolved.append({"goos": current_goos, "goarch": current_goarch, "tags": []})
    return resolved


def current_go_platform() -> tuple[str, str]:
    completed = run_command([str(ROOT_DIR / "scripts" / "go.sh"), "env", "GOOS", "GOARCH"])
    lines = [line.strip() for line in completed.stdout.splitlines() if line.strip()]
    if len(lines) != 2:
        raise RuntimeError(f"Unexpected GOOS/GOARCH output: {completed.stdout!r}")
    return lines[0], lines[1]


def discover_go_main_packages() -> list[str]:
    mains = []
    for path in sorted((ROOT_DIR / "cmd").glob("*/main.go")):
        mains.append(f"./{path.parent.relative_to(ROOT_DIR).as_posix()}")
    return mains


def normalize_go_deadcode_findings(
    *,
    packages: list[dict[str, Any]],
    scope: str,
    build_config: dict[str, Any],
    generated_globs: list[str],
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for package in packages:
        package_path = package.get("Path", "")
        for func in package.get("Funcs", []):
            position = func.get("Position", {})
            path = normalize_tool_path(position.get("File", ""))
            if not path or matches_any_glob(path, generated_globs):
                continue
            symbol_name = func.get("Name", "")
            findings.append(
                {
                    "language": "go",
                    "lane": "reachability",
                    "tool": "deadcode",
                    "scope": scope,
                    "package_path": package_path,
                    "path": path,
                    "line": int(position.get("Line", 0)),
                    "column": int(position.get("Col", 0)),
                    "symbol": f"{package_path}.{symbol_name}" if package_path else symbol_name,
                    "symbol_name": symbol_name,
                    "generated": bool(func.get("Generated", False)),
                    "marker": bool(func.get("Marker", False)),
                    "config": build_config,
                }
            )
    return findings


def intersect_go_deadcode_findings(
    findings: list[dict[str, Any]],
    build_config_count: int,
) -> list[dict[str, Any]]:
    if build_config_count <= 1:
        return dedupe_findings(findings)

    grouped: dict[tuple[Any, ...], list[dict[str, Any]]] = {}
    for finding in findings:
        grouped.setdefault(go_deadcode_identity(finding), []).append(finding)

    intersected: list[dict[str, Any]] = []
    for entries in grouped.values():
        configs = {
            json.dumps(entry.get("config"), sort_keys=True)
            for entry in entries
        }
        if len(configs) != build_config_count:
            continue
        base = dict(entries[0])
        base["configs"] = [entry["config"] for entry in sorted(entries, key=lambda item: json.dumps(item["config"], sort_keys=True))]
        intersected.append(base)
    return dedupe_findings(intersected)


def go_deadcode_identity(finding: dict[str, Any]) -> tuple[Any, ...]:
    return (
        finding.get("language"),
        finding.get("lane"),
        finding.get("tool"),
        finding.get("scope"),
        finding.get("package_path"),
        finding.get("path"),
        finding.get("line"),
        finding.get("column"),
        finding.get("symbol"),
        finding.get("symbol_name"),
    )


STATICCHECK_MESSAGE_RE = re.compile(r"^(?P<kind>\w+)\s+(?P<symbol>.+)\s+is unused$")


def normalize_staticcheck_findings(
    *,
    output: str,
    generated_globs: list[str],
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for line in output.splitlines():
        line = line.strip()
        if not line:
            continue
        record = json.loads(line)
        path = normalize_tool_path(record.get("location", {}).get("file", ""))
        if not path or matches_any_glob(path, generated_globs):
            continue
        parsed = parse_staticcheck_message(record.get("message", ""))
        findings.append(
            {
                "language": "go",
                "lane": "lint-unused",
                "bucket": "lint-unused",
                "tool": "staticcheck",
                "confidence": "high",
                "path": path,
                "line": int(record.get("location", {}).get("line", 0)),
                "column": int(record.get("location", {}).get("column", 0)),
                "kind": parsed.get("kind"),
                "symbol": parsed.get("symbol"),
                "message": record.get("message", ""),
                "code": record.get("code"),
                "evidence": [record.get("message", "")],
            }
        )
    return dedupe_findings(findings)


def parse_staticcheck_message(message: str) -> dict[str, str | None]:
    match = STATICCHECK_MESSAGE_RE.match(message)
    if not match:
        return {"kind": None, "symbol": None}
    return {
        "kind": match.group("kind"),
        "symbol": match.group("symbol"),
    }


def aggregate_go_findings(
    *,
    prod_findings: list[dict[str, Any]],
    test_findings: list[dict[str, Any]],
    tooling_findings: list[dict[str, Any]],
    staticcheck_findings: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    aggregated: list[dict[str, Any]] = []
    test_keys = {finding_identity(finding) for finding in test_findings}
    tooling_keys = {finding_identity(finding) for finding in tooling_findings}

    for finding in prod_findings:
        identity = finding_identity(finding)
        reachable_from: list[str] = []
        evidence = ["dead in production Go roots"]
        if identity not in test_keys:
            reachable_from.append("test")
            evidence.append("reachable when Go test roots are included")
        else:
            evidence.append("dead when Go test roots are included")
        if tooling_keys and identity not in tooling_keys:
            reachable_from.append("tooling")
            evidence.append("reachable from Go tooling roots")
        elif tooling_keys:
            evidence.append("dead from Go tooling roots")

        bucket = "dead" if not reachable_from else "prod-dead"
        confidence = "high" if bucket == "dead" else "medium"
        aggregated.append(
            {
                "language": "go",
                "lane": "reachability",
                "bucket": bucket,
                "tool": "deadcode",
                "confidence": confidence,
                "root_scope": "prod",
                "path": finding["path"],
                "line": finding["line"],
                "column": finding["column"],
                "symbol": finding["symbol"],
                "package_path": finding["package_path"],
                "config": finding["config"],
                "configs": finding.get("configs", [finding["config"]]),
                "reachable_from": reachable_from,
                "generated": finding["generated"],
                "evidence": evidence,
            }
        )

    aggregated.extend(staticcheck_findings)
    return dedupe_findings(aggregated)


def build_python_reports(
    config: dict[str, Any],
    output_dir: Path,
    generated_at: str,
) -> dict[str, Any]:
    python_config = config.get("python", {})
    coverage_version = installed_python_package_version("coverage")
    generated_globs = list(python_config.get("generated_globs", []))
    public_modules = list(python_config.get("public_modules", []))
    vulture_min_confidence = int(python_config.get("vulture_min_confidence", 80))
    vulture_version = installed_python_package_version("vulture")
    command = [
        sys.executable,
        "-m",
        "ruff",
        "check",
        "backend/setta",
        "scripts",
        "--output-format",
        "json",
        "--exit-zero",
        "--select",
        ",".join(PYTHON_UNUSED_RULES),
    ]
    completed = run_command(command)
    raw_findings = json.loads(completed.stdout or "[]")
    lint_findings = normalize_python_ruff_findings(raw_findings, generated_globs)

    lint_report = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at,
        "language": "python",
        "tool": "ruff",
        "lane": "lint-unused",
        "commands": [command_display(command)],
        "public_modules": public_modules,
        "warnings": [],
        "limitations": [],
        "findings": lint_findings,
    }
    lint_path = output_dir / "python.json"
    write_json(lint_path, lint_report)

    public_import_modules, public_module_warnings = resolve_python_public_import_modules(public_modules)
    coverage_payload, coverage_commands = collect_python_smoke_coverage(
        public_import_modules=public_import_modules,
        generated_globs=generated_globs,
    )
    vulture_command = [
        sys.executable,
        "-m",
        "vulture",
        "backend/setta",
        "--min-confidence",
        str(vulture_min_confidence),
    ]
    vulture_completed = run_command(vulture_command, allowed_exit_codes={0, 3})
    reachability_findings = normalize_python_vulture_findings(
        output=vulture_completed.stdout,
        coverage_files=coverage_payload["files"],
        generated_globs=generated_globs,
        public_modules=public_modules,
    )
    reachability_limitations = [
        "Python reachability is advisory: findings come from vulture candidates filtered by smoke coverage, not from a full static call graph.",
    ]
    reachability_report = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at,
        "language": "python",
        "lane": "reachability",
        "tool": "vulture",
        "commands": coverage_commands + [command_display(vulture_command)],
        "coverage_version": coverage_version,
        "vulture_version": vulture_version,
        "vulture_min_confidence": vulture_min_confidence,
        "public_modules": public_modules,
        "public_import_modules": public_import_modules,
        "warnings": public_module_warnings,
        "limitations": reachability_limitations,
        "coverage_summary": coverage_payload["summary"],
        "findings": reachability_findings,
    }
    reachability_path = output_dir / "python-reachability.json"
    write_json(reachability_path, reachability_report)

    return {
        "findings": dedupe_findings(lint_findings + reachability_findings),
        "warnings": public_module_warnings,
        "limitations": reachability_limitations,
        "report_paths": [
            {"language": "python", "path": relative_path(lint_path)},
            {"language": "python", "path": relative_path(reachability_path)},
        ],
        "tool_status": {
            "lint_unused": "ok",
            "reachability": "ok",
            "public_modules": public_modules,
            "public_import_modules": public_import_modules,
            "coverage_version": coverage_version,
            "vulture_version": vulture_version,
        },
    }


def normalize_python_ruff_findings(
    raw_findings: list[dict[str, Any]],
    generated_globs: list[str],
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for record in raw_findings:
        path = normalize_tool_path(record.get("filename", ""))
        if not path or matches_any_glob(path, generated_globs):
            continue
        findings.append(
            {
                "language": "python",
                "lane": "lint-unused",
                "bucket": "lint-unused",
                "tool": "ruff",
                "confidence": "high",
                "path": path,
                "line": int(record.get("location", {}).get("row", 0)),
                "column": int(record.get("location", {}).get("column", 0)),
                "symbol": None,
                "code": record.get("code"),
                "message": record.get("message"),
                "evidence": [record.get("message", "")],
            }
        )
    return dedupe_findings(findings)


def resolve_python_public_import_modules(public_modules: list[str]) -> tuple[list[str], list[str]]:
    import_modules: list[str] = []
    warnings: list[str] = []
    for module_path in public_modules:
        try:
            import_modules.append(python_module_name_from_path(module_path))
        except ValueError as exc:
            warnings.append(str(exc))
    return sorted(dict.fromkeys(import_modules)), sorted(dict.fromkeys(warnings))


def python_module_name_from_path(path: str) -> str:
    module_path = Path(path)
    parts = module_path.parts
    if len(parts) < 3 or parts[0] != "backend" or parts[1] != "setta" or module_path.suffix != ".py":
        raise ValueError(f"Python public module path must live under backend/setta and end with .py: {path}")
    module_parts = list(module_path.with_suffix("").parts[2:])
    if not module_parts:
        raise ValueError(f"Python public module path did not resolve to a module: {path}")
    if module_parts[-1] == "__init__":
        module_parts = module_parts[:-1]
    return ".".join(["setta", *module_parts]) if module_parts else "setta"


def collect_python_smoke_coverage(
    *,
    public_import_modules: list[str],
    generated_globs: list[str],
) -> tuple[dict[str, Any], list[str]]:
    coverage_base = [sys.executable, "-m", "coverage"]
    command_displays: list[str] = []

    with tempfile.TemporaryDirectory(prefix="setta-deadcode-python-coverage-") as temp_dir:
        temp_dir_path = Path(temp_dir)
        coverage_env = {**os.environ, "COVERAGE_FILE": str(temp_dir_path / ".coverage")}
        coverage_json_path = temp_dir_path / "coverage.json"
        import_smoke_path = temp_dir_path / "public_import_smoke.py"
        import_smoke_path.write_text(
            "".join(f"import {module_name}\n" for module_name in public_import_modules),
            encoding="utf-8",
        )

        commands = [
            [*coverage_base, "erase"],
            [*coverage_base, "run", "--append", "-m", "setta", "--help"],
            [*coverage_base, "run", "--append", str(import_smoke_path)],
            [
                *coverage_base,
                "json",
                "-q",
                "-o",
                str(coverage_json_path),
                "--include",
                ",".join(
                    [
                        "backend/setta/*.py",
                        "backend/setta/**/*.py",
                    ]
                ),
            ],
        ]
        for command in commands:
            run_command(command, env=coverage_env)
            command_displays.append(
                display_python_coverage_command(
                    command,
                    import_smoke_path=import_smoke_path,
                    coverage_json_path=coverage_json_path,
                )
            )

        payload = json.loads(coverage_json_path.read_text(encoding="utf-8"))
    files = normalize_python_coverage_files(payload, generated_globs)
    executed_file_count = sum(1 for record in files.values() if record["executed_lines"])
    return (
        {
            "files": files,
            "summary": {
                "smoke_root_count": 2,
                "public_import_module_count": len(public_import_modules),
                "covered_file_count": len(files),
                "executed_file_count": executed_file_count,
            },
        },
        command_displays,
    )


def display_python_coverage_command(
    command: list[str],
    *,
    import_smoke_path: Path,
    coverage_json_path: Path,
) -> str:
    replacements = {
        str(import_smoke_path): "<temp-public-import-smoke.py>",
        str(coverage_json_path): "<temp-coverage.json>",
    }
    return command_display([replacements.get(part, part) for part in command])


def installed_python_package_version(distribution_name: str) -> str:
    try:
        return metadata.version(distribution_name)
    except metadata.PackageNotFoundError as exc:
        raise RuntimeError(
            f"Required Python tool is not installed in the repo environment: {distribution_name}. "
            "Run ./update_dependencies.sh and then reactivate the environment."
        ) from exc


def normalize_python_coverage_files(
    payload: dict[str, Any],
    generated_globs: list[str],
) -> dict[str, dict[str, list[int]]]:
    files: dict[str, dict[str, list[int]]] = {}
    for raw_path, record in payload.get("files", {}).items():
        path = normalize_tool_path(raw_path)
        if not path.startswith("backend/setta/") or matches_any_glob(path, generated_globs):
            continue
        files[path] = {
            "executed_lines": sorted(int(line) for line in record.get("executed_lines", [])),
            "missing_lines": sorted(int(line) for line in record.get("missing_lines", [])),
        }
    return dict(sorted(files.items()))


def normalize_python_vulture_findings(
    *,
    output: str,
    coverage_files: dict[str, dict[str, list[int]]],
    generated_globs: list[str],
    public_modules: list[str],
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    public_module_set = set(public_modules)
    for raw_line in output.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        match = PYTHON_VULTURE_RE.match(line)
        if not match:
            continue
        path = normalize_tool_path(match.group("path"))
        if (
            not path
            or not path.startswith("backend/setta/")
            or matches_any_glob(path, generated_globs)
            or path in public_module_set
        ):
            continue
        line_number = int(match.group("line"))
        coverage_record = coverage_files.get(path, {"executed_lines": [], "missing_lines": []})
        executed_lines = set(coverage_record.get("executed_lines", []))
        if line_number in executed_lines:
            continue
        file_executed = bool(executed_lines)
        evidence = [f"reported by vulture ({match.group('confidence')}% confidence)"]
        if file_executed:
            evidence.append("candidate line was not executed by Python smoke roots")
        else:
            evidence.append("file was not executed by Python smoke roots")
        findings.append(
            {
                "language": "python",
                "lane": "reachability",
                "bucket": "prod-dead",
                "tool": "vulture",
                "confidence": "medium",
                "root_scope": "smoke",
                "path": path,
                "line": line_number,
                "column": None,
                "symbol": match.group("symbol"),
                "kind": match.group("kind"),
                "vulture_confidence": int(match.group("confidence")),
                "file_executed_in_smoke": file_executed,
                "evidence": evidence,
            }
        )
    return dedupe_findings(findings)


def build_frontend_reports(
    config: dict[str, Any],
    output_dir: Path,
    generated_at: str,
) -> dict[str, Any]:
    frontend_config = config.get("frontend", {})
    app_roots = list(frontend_config.get("app_roots", ["frontend/src/index.tsx"]))
    generated_globs = list(frontend_config.get("generated_globs", []))
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
            "Frontend full-graph reachability reflects Knip's non-production roots collectively; this first pass does not split test-only from other non-production roots.",
        ],
        "findings": knip_full_findings,
    }
    knip_full_path = output_dir / "frontend-all.json"
    write_json(knip_full_path, knip_full_report)

    eslint_command = [
        "pnpm",
        "-C",
        "frontend",
        "exec",
        "eslint",
        "src",
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
    eslint_findings = normalize_frontend_eslint_findings(eslint_payload, generated_globs)
    eslint_report = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at,
        "language": "frontend",
        "lane": "lint-unused",
        "tool": "eslint",
        "commands": [command_display(eslint_command)],
        "app_roots": app_roots,
        "warnings": warnings,
        "limitations": [
            "Frontend lint-unused uses a focused ESLint no-unused-vars pass because repo-wide tsc currently has unrelated type errors.",
        ],
        "findings": eslint_findings,
    }
    eslint_path = output_dir / "frontend-lint-unused.json"
    write_json(eslint_path, eslint_report)

    reachability_findings = aggregate_frontend_findings(
        prod_findings=knip_prod_findings,
        full_findings=knip_full_findings,
    )
    findings = dedupe_findings(reachability_findings + eslint_findings)
    limitations = (
        list(knip_prod_report["limitations"])
        + list(knip_full_report["limitations"])
        + list(eslint_report["limitations"])
    )
    return {
        "findings": findings,
        "warnings": warnings,
        "limitations": limitations,
        "report_paths": [
            {"language": "frontend", "path": relative_path(knip_prod_path)},
            {"language": "frontend", "path": relative_path(knip_full_path)},
            {"language": "frontend", "path": relative_path(eslint_path)},
        ],
        "tool_status": {
            "reachability": "ok",
            "lint_unused": "ok",
            "app_roots": app_roots,
        },
    }


def normalize_knip_findings(
    payload: dict[str, Any],
    generated_globs: list[str],
    *,
    scope: str,
    issue_label: str,
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []

    for file_path in payload.get("files", []):
        path = normalize_tool_path(f"frontend/{file_path}")
        if not path or matches_any_glob(path, generated_globs) or is_frontend_test_path(path):
            continue
        findings.append(
            {
                "language": "frontend",
                "lane": "reachability",
                "bucket": "prod-dead",
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
        file_path = normalize_tool_path(f"frontend/{issue.get('file', '')}")
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
                        "bucket": "prod-dead",
                        "tool": "knip",
                        "confidence": "medium",
                        "scope": scope,
                        "path": file_path,
                        "line": item.get("line"),
                        "column": item.get("col"),
                        "symbol": item.get("name"),
                        "issue_type": issue_type,
                        "evidence": [f"reported by {issue_label} as unused {issue_type.rstrip('s')}"],
                    }
                )
    return dedupe_findings(findings)


def aggregate_frontend_findings(
    *,
    prod_findings: list[dict[str, Any]],
    full_findings: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    aggregated: list[dict[str, Any]] = []
    full_keys = {frontend_reachability_identity(finding) for finding in full_findings}

    for finding in prod_findings:
        identity = frontend_reachability_identity(finding)
        reachable_from: list[str] = []
        evidence = ["dead in production frontend roots"]
        if identity not in full_keys:
            reachable_from.append("non-prod")
            evidence.append("reachable when frontend non-production roots are included")
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


def normalize_frontend_eslint_findings(
    payload: list[dict[str, Any]],
    generated_globs: list[str],
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for file_result in payload:
        path = normalize_tool_path(file_result.get("filePath", ""))
        if not path or matches_any_glob(path, generated_globs) or is_frontend_test_path(path):
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


def run_command(
    command: list[str],
    *,
    env: dict[str, str] | None = None,
    allowed_exit_codes: set[int] | None = None,
) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(
        command,
        cwd=ROOT_DIR,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    allowed = allowed_exit_codes if allowed_exit_codes is not None else {0}
    if completed.returncode not in allowed:
        raise RuntimeError(
            "Command failed with exit code "
            f"{completed.returncode}: {command_display(command)}\n"
            f"stdout:\n{completed.stdout}\n"
            f"stderr:\n{completed.stderr}"
        )
    return completed


def command_display(command: list[str]) -> str:
    return " ".join(shell_quote(part) for part in command)


def shell_quote(value: str) -> str:
    if re.fullmatch(r"[A-Za-z0-9_./:@=-]+", value):
        return value
    return "'" + value.replace("'", "'\"'\"'") + "'"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=False)
        handle.write("\n")


def relative_path(path: Path) -> str:
    return path.resolve(strict=False).relative_to(ROOT_DIR).as_posix()


def normalize_tool_path(value: str) -> str:
    if not value:
        return ""
    path = Path(value)
    if path.is_absolute():
        try:
            return path.resolve(strict=False).relative_to(ROOT_DIR).as_posix()
        except ValueError:
            return path.resolve(strict=False).as_posix()
    return path.as_posix().lstrip("./")


def matches_any_glob(path: str, globs: list[str]) -> bool:
    return any(fnmatch.fnmatch(path, pattern) for pattern in globs)


def finding_identity(finding: dict[str, Any]) -> tuple[Any, ...]:
    return (
        finding.get("language"),
        finding.get("lane"),
        finding.get("tool"),
        finding.get("path"),
        finding.get("line"),
        finding.get("column"),
        finding.get("symbol"),
        json.dumps(finding.get("config"), sort_keys=True),
    )


def dedupe_findings(findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[Any, ...]] = set()
    result: list[dict[str, Any]] = []
    for finding in sorted(findings, key=sort_finding_key):
        identity = finding_identity(finding)
        if identity in seen:
            continue
        seen.add(identity)
        result.append(finding)
    return result


def sort_finding_key(finding: dict[str, Any]) -> tuple[Any, ...]:
    return (
        finding.get("language") or "",
        finding.get("lane") or "",
        finding.get("bucket") or "",
        finding.get("path") or "",
        int(finding.get("line") or 0),
        int(finding.get("column") or 0),
        finding.get("symbol") or "",
        finding.get("tool") or "",
    )


def build_summary(findings: list[dict[str, Any]]) -> dict[str, Any]:
    by_language = Counter(finding["language"] for finding in findings)
    by_lane = Counter(finding["lane"] for finding in findings)
    by_bucket = Counter(finding["bucket"] for finding in findings)
    return {
        "total_findings": len(findings),
        "by_language": dict(sorted(by_language.items())),
        "by_lane": dict(sorted(by_lane.items())),
        "by_bucket": dict(sorted(by_bucket.items())),
    }


if __name__ == "__main__":
    raise SystemExit(main())
