#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import deadcode_common as common
import frontend_reports
import python_reports

ROOT_DIR = common.ROOT_DIR
DEFAULT_CONFIG_PATH = ROOT_DIR / "deadcode.overrides.yaml"
DEFAULT_OUTPUT_DIR = ROOT_DIR / "reports" / "deadcode"
SCHEMA_VERSION = common.SCHEMA_VERSION
GO_GENERATED_FALLBACK_GLOBS = ["**/*_gen.go"]
GO_REACHABILITY_REPORTS = (
    ("go-prod.json", "prod", False),
    ("go-test.json", "test", True),
    ("go-tooling.json", "tooling", False),
)
DEFAULT_GO_STATICCHECK_PACKAGES = ["./..."]
DEFAULT_PYTHON_LINT_ROOTS = python_reports.DEFAULT_PYTHON_LINT_ROOTS
DEFAULT_FRONTEND_LINT_ROOTS = frontend_reports.DEFAULT_FRONTEND_LINT_ROOTS

load_config = common.load_config
config_string_list = common.config_string_list
command_display = common.command_display
write_json = common.write_json
matches_any_glob = common.matches_any_glob
finding_identity = common.finding_identity
dedupe_findings = common.dedupe_findings
sort_finding_key = common.sort_finding_key
build_summary = common.build_summary
run_command = common.run_command
now_iso = common.now_iso
STATICCHECK_MESSAGE_RE = re.compile(r"^(?P<kind>\w+)\s+(?P<symbol>.+)\s+is unused$")


def _sync_common_context() -> tuple[Path, Any]:
    previous_root = common.ROOT_DIR
    previous_run_command = common.run_command
    common.ROOT_DIR = ROOT_DIR
    common.run_command = run_command
    return previous_root, previous_run_command


def _restore_common_context(previous_root: Path, previous_run_command: Any) -> None:
    common.ROOT_DIR = previous_root
    common.run_command = previous_run_command


def resolve_generated_globs(
    language: str,
    config: dict[str, Any],
    fallback: list[str],
) -> list[str]:
    previous_root, previous_run_command = _sync_common_context()
    try:
        return common.resolve_generated_globs(language, config, fallback)
    finally:
        _restore_common_context(previous_root, previous_run_command)


def relative_path(path: Path) -> str:
    previous_root, previous_run_command = _sync_common_context()
    try:
        return common.relative_path(path)
    finally:
        _restore_common_context(previous_root, previous_run_command)


def normalize_tool_path(value: str) -> str:
    previous_root, previous_run_command = _sync_common_context()
    try:
        return common.normalize_tool_path(value)
    finally:
        _restore_common_context(previous_root, previous_run_command)


def _sync_child_module(module: Any) -> dict[str, Any]:
    previous = {
        "ROOT_DIR": module.ROOT_DIR,
        "run_command": module.run_command,
        "resolve_generated_globs": module.resolve_generated_globs,
        "relative_path": module.relative_path,
        "normalize_tool_path": module.normalize_tool_path,
    }
    module.ROOT_DIR = ROOT_DIR
    module.run_command = run_command
    module.resolve_generated_globs = resolve_generated_globs
    module.relative_path = relative_path
    module.normalize_tool_path = normalize_tool_path
    return previous


def _restore_child_module(module: Any, previous: dict[str, Any]) -> None:
    for name, value in previous.items():
        setattr(module, name, value)


def build_python_reports(
    config: dict[str, Any],
    output_dir: Path,
    generated_at: str,
) -> dict[str, Any]:
    previous = _sync_child_module(python_reports)
    try:
        return python_reports.build_python_reports(config, output_dir, generated_at)
    finally:
        _restore_child_module(python_reports, previous)


def build_frontend_reports(
    config: dict[str, Any],
    output_dir: Path,
    generated_at: str,
) -> dict[str, Any]:
    previous = _sync_child_module(frontend_reports)
    try:
        return frontend_reports.build_frontend_reports(config, output_dir, generated_at)
    finally:
        _restore_child_module(frontend_reports, previous)


def build_frontend_package_reports(
    *,
    output_dir: Path,
    generated_at: str,
    package_roots: list[str],
    generated_globs: list[str],
) -> tuple[list[dict[str, str]], list[dict[str, Any]]]:
    previous = _sync_child_module(frontend_reports)
    try:
        return frontend_reports.build_frontend_package_reports(
            output_dir=output_dir,
            generated_at=generated_at,
            package_roots=package_roots,
            generated_globs=generated_globs,
        )
    finally:
        _restore_child_module(frontend_reports, previous)


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Generate production-oriented dead-code candidate reports. "
            "This is not a whole-repo unused-code proof."
        )
    )
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


def build_go_reports(
    config: dict[str, Any],
    output_dir: Path,
    generated_at: str,
) -> dict[str, Any]:
    go_config = config.get("go", {})
    deadcode_version = go_config.get("deadcode_version", "v0.44.0")
    staticcheck_version = go_config.get("staticcheck_version", "2025.1.1")
    build_matrix = resolve_go_build_matrix(go_config.get("build_matrix"))
    production_mains, production_root_sources, production_warnings = (
        discover_go_production_mains(go_config)
    )
    discovered_mains = discover_go_main_packages()
    production_mains_set = set(production_mains)
    tooling_mains = sorted(
        pkg for pkg in discovered_mains if pkg not in production_mains_set
    )
    generated_globs = resolve_generated_globs(
        "go", go_config, GO_GENERATED_FALLBACK_GLOBS
    )
    staticcheck_packages = config_string_list(
        go_config, "staticcheck_packages", DEFAULT_GO_STATICCHECK_PACKAGES
    )

    warnings: list[str] = list(production_warnings)
    limitations: list[str] = []

    unknown_prod = sorted(
        pkg for pkg in production_mains_set if pkg not in discovered_mains
    )
    if unknown_prod:
        warnings.append(
            "Configured Go production mains were not discovered under cmd/: "
            + ", ".join(unknown_prod)
        )

    findings_by_scope, report_paths = build_go_reachability_reports(
        output_dir=output_dir,
        generated_at=generated_at,
        deadcode_version=deadcode_version,
        build_matrix=build_matrix,
        production_mains=sorted(production_mains),
        tooling_mains=tooling_mains,
        generated_globs=generated_globs,
    )
    staticcheck_findings, staticcheck_path = write_go_staticcheck_report(
        output_dir=output_dir,
        generated_at=generated_at,
        staticcheck_version=staticcheck_version,
        generated_globs=generated_globs,
        package_patterns=staticcheck_packages,
    )
    report_paths.append({"language": "go", "path": relative_path(staticcheck_path)})

    go_findings = aggregate_go_findings(
        prod_findings=findings_by_scope["prod"],
        test_findings=findings_by_scope["test"],
        tooling_findings=findings_by_scope["tooling"],
        staticcheck_findings=staticcheck_findings,
    )

    if not tooling_mains:
        limitations.append(
            "No Go tooling mains were discovered under cmd/ beyond configured production mains."
        )

    return {
        "findings": go_findings,
        "warnings": warnings,
        "limitations": limitations,
        "report_paths": report_paths,
        "tool_status": {
            "reachability": "ok",
            "lint_unused": "ok",
            "production_mains": sorted(production_mains),
            "production_root_sources": production_root_sources,
            "tooling_mains": tooling_mains,
            "build_matrix": build_matrix,
            "staticcheck_packages": staticcheck_packages,
        },
    }


def build_go_reachability_reports(
    output_dir: Path,
    generated_at: str,
    deadcode_version: str,
    build_matrix: list[dict[str, Any]],
    production_mains: list[str],
    tooling_mains: list[str],
    generated_globs: list[str],
) -> tuple[dict[str, list[dict[str, Any]]], list[dict[str, str]]]:
    report_paths: list[dict[str, str]] = []
    findings_by_scope: dict[str, list[dict[str, Any]]] = {
        "prod": [],
        "test": [],
        "tooling": [],
    }
    mains_by_scope = {
        "prod": production_mains,
        "test": production_mains,
        "tooling": tooling_mains,
    }

    for report_name, scope, include_tests in GO_REACHABILITY_REPORTS:
        mains = mains_by_scope[scope]
        deduped_findings, commands = collect_go_deadcode_findings(
            mains=mains,
            scope=scope,
            include_tests=include_tests,
            deadcode_version=deadcode_version,
            build_matrix=build_matrix,
            generated_globs=generated_globs,
        )
        path = output_dir / report_name
        write_json(
            path,
            {
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
            },
        )
        report_paths.append({"language": "go", "path": relative_path(path)})
        findings_by_scope[scope] = deduped_findings

    return findings_by_scope, report_paths


def collect_go_deadcode_findings(
    mains: list[str],
    scope: str,
    include_tests: bool,
    deadcode_version: str,
    build_matrix: list[dict[str, Any]],
    generated_globs: list[str],
) -> tuple[list[dict[str, Any]], list[list[str]]]:
    if not mains:
        return [], []

    raw_findings: list[dict[str, Any]] = []
    commands: list[list[str]] = []
    for build_config in build_matrix:
        cmd = build_go_deadcode_command(
            mains, include_tests, deadcode_version, build_config
        )
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

    return intersect_go_deadcode_findings(raw_findings, len(build_matrix)), commands


def build_go_deadcode_command(
    mains: list[str],
    include_tests: bool,
    deadcode_version: str,
    build_config: dict[str, Any],
) -> list[str]:
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
    return cmd


def write_go_staticcheck_report(
    output_dir: Path,
    generated_at: str,
    staticcheck_version: str,
    generated_globs: list[str],
    package_patterns: list[str],
) -> tuple[list[dict[str, Any]], Path]:
    staticcheck_cmd = [
        str(ROOT_DIR / "scripts" / "go.sh"),
        "run",
        f"honnef.co/go/tools/cmd/staticcheck@{staticcheck_version}",
        "-checks=U1000",
        "-tests=false",
        "-f",
        "json",
        "-fail=none",
    ]
    staticcheck_cmd.extend(package_patterns)
    staticcheck_completed = run_command(staticcheck_cmd)
    staticcheck_findings = normalize_staticcheck_findings(
        output=staticcheck_completed.stdout,
        generated_globs=generated_globs,
    )
    path = output_dir / "go-u1000.json"
    write_json(
        path,
        {
            "schema_version": SCHEMA_VERSION,
            "generated_at": generated_at,
            "language": "go",
            "lane": "lint-unused",
            "tool": "staticcheck",
            "commands": [command_display(staticcheck_cmd)],
            "warnings": [],
            "limitations": [],
            "findings": staticcheck_findings,
        },
    )
    return staticcheck_findings, path


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
    completed = run_command(
        [str(ROOT_DIR / "scripts" / "go.sh"), "env", "GOOS", "GOARCH"]
    )
    lines = [line.strip() for line in completed.stdout.splitlines() if line.strip()]
    if len(lines) != 2:
        raise RuntimeError(f"Unexpected GOOS/GOARCH output: {completed.stdout!r}")
    return lines[0], lines[1]


def discover_go_main_packages() -> list[str]:
    mains = []
    completed = run_command(
        [
            str(ROOT_DIR / "scripts" / "go.sh"),
            "list",
            "-f",
            '{{if eq .Name "main"}}{{.Dir}}{{end}}',
            "./...",
        ]
    )
    for raw_line in completed.stdout.splitlines():
        raw_path = raw_line.strip()
        if not raw_path:
            continue
        path = Path(raw_path).resolve(strict=False)
        try:
            mains.append(f"./{path.relative_to(ROOT_DIR).as_posix()}")
        except ValueError:
            continue
    return mains


def discover_go_production_mains(
    go_config: dict[str, Any],
) -> tuple[list[str], dict[str, list[str]], list[str]]:
    configured = go_config.get("production_mains")
    if isinstance(configured, list) and configured:
        normalized = sorted({str(item) for item in configured})
        return normalized, {"config_override": normalized}, []

    source_paths = {
        "packaged_binaries": ROOT_DIR / "scripts" / "build_packaged_go_binaries.sh",
        "python_entrypoint": ROOT_DIR / "backend" / "setta" / "entrypoint.py",
        "source_server_wrapper": ROOT_DIR / "scripts" / "run_setta_server.sh",
    }
    discovered_by_source: dict[str, list[str]] = {}
    discovered_union: set[str] = set()
    warnings: list[str] = []

    for source_name, path in source_paths.items():
        if not path.exists():
            warnings.append(
                f"Go production-root source file was not found: {relative_path(path)}"
            )
            continue
        mains = discover_go_cmd_packages_in_text(path.read_text(encoding="utf-8"))
        if mains:
            discovered_by_source[source_name] = mains
            discovered_union.update(mains)

    if discovered_union:
        return sorted(discovered_union), discovered_by_source, warnings

    fallback = ["./cmd/setta", "./cmd/setta-server"]
    warnings.append(
        "Fell back to default Go production mains because authoritative packaging/launcher sources did not yield any cmd roots."
    )
    return fallback, {"fallback": fallback}, warnings


def discover_go_cmd_packages_in_text(text: str) -> list[str]:
    matches = sorted(set(re.findall(r"\./cmd/[A-Za-z0-9._-]+", text)))
    return matches


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
                    "symbol": f"{package_path}.{symbol_name}"
                    if package_path
                    else symbol_name,
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
        configs = {json.dumps(entry.get("config"), sort_keys=True) for entry in entries}
        if len(configs) != build_config_count:
            continue
        base = dict(entries[0])
        base["configs"] = [
            entry["config"]
            for entry in sorted(
                entries, key=lambda item: json.dumps(item["config"], sort_keys=True)
            )
        ]
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


if __name__ == "__main__":
    raise SystemExit(main())
