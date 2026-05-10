#!/usr/bin/env python
from __future__ import annotations

import json
import os
import re
import sys
import tempfile
import tomllib
from importlib import metadata
from pathlib import Path
from typing import Any

import deadcode_common as common

ROOT_DIR = common.ROOT_DIR
SCHEMA_VERSION = common.SCHEMA_VERSION
DEFAULT_PYTHON_LINT_ROOTS = ["backend/setta", "scripts"]
DEFAULT_PYTHON_REACHABILITY_ROOTS = ["backend/setta", "scripts"]
DEFAULT_PYTHON_TEST_LINT_ROOTS = ["tests"]
DEFAULT_PYTHON_TEST_REACHABILITY_ROOTS = ["tests"]
DEFAULT_PYTHON_ENTRYPOINT_COMMANDS = [
    ["-m", "setta", "--help"],
    ["-m", "setta", "version"],
]
DEFAULT_PYTHON_VULTURE_MIN_CONFIDENCE = 60
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

config_string_list = common.config_string_list
resolve_generated_globs = common.resolve_generated_globs
run_command = common.run_command
command_display = common.command_display
write_json = common.write_json
relative_path = common.relative_path
normalize_tool_path = common.normalize_tool_path
matches_any_glob = common.matches_any_glob
dedupe_findings = common.dedupe_findings


def build_python_reports(
    config: dict[str, Any],
    output_dir: Path,
    generated_at: str,
) -> dict[str, Any]:
    python_config = config.get("python", {})
    coverage_version = installed_python_package_version("coverage")
    generated_globs = resolve_generated_globs("python", python_config, [])
    lint_roots = config_string_list(
        python_config, "lint_roots", DEFAULT_PYTHON_LINT_ROOTS
    )
    test_lint_roots = config_string_list(
        python_config, "test_lint_roots", DEFAULT_PYTHON_TEST_LINT_ROOTS
    )
    reachability_roots = config_string_list(
        python_config, "reachability_roots", DEFAULT_PYTHON_REACHABILITY_ROOTS
    )
    test_reachability_roots = config_string_list(
        python_config,
        "test_reachability_roots",
        DEFAULT_PYTHON_TEST_REACHABILITY_ROOTS,
    )
    entrypoint_commands = config_command_list(
        python_config,
        "entrypoint_commands",
        DEFAULT_PYTHON_ENTRYPOINT_COMMANDS,
    )
    public_modules = list(python_config.get("public_modules", []))
    package_import_modules, package_root_warnings = (
        discover_python_package_import_modules()
    )
    plugin_backend_entrypoints, plugin_backend_warnings = (
        discover_python_plugin_backend_entrypoints()
    )
    effective_reachability_roots = dedupe_strings(
        [*reachability_roots, *plugin_backend_entrypoints]
    )
    vulture_min_confidence = int(
        python_config.get(
            "vulture_min_confidence",
            DEFAULT_PYTHON_VULTURE_MIN_CONFIDENCE,
        )
    )
    vulture_version = installed_python_package_version("vulture")
    command = [
        sys.executable,
        "-m",
        "ruff",
        "check",
        *lint_roots,
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
        "lint_roots": lint_roots,
        "public_modules": public_modules,
        "warnings": [],
        "limitations": [],
        "findings": lint_findings,
    }
    lint_path = output_dir / "python.json"
    write_json(lint_path, lint_report)

    test_lint_command = [
        sys.executable,
        "-m",
        "ruff",
        "check",
        *test_lint_roots,
        "--output-format",
        "json",
        "--exit-zero",
        "--select",
        ",".join(PYTHON_UNUSED_RULES),
    ]
    test_lint_completed = run_command(test_lint_command)
    test_lint_raw_findings = json.loads(test_lint_completed.stdout or "[]")
    test_lint_findings = normalize_python_ruff_findings(
        test_lint_raw_findings,
        generated_globs,
        root_scope="test",
        bucket="test-unused",
    )
    test_lint_report = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at,
        "language": "python",
        "tool": "ruff",
        "lane": "lint-unused",
        "scope": "test",
        "commands": [command_display(test_lint_command)],
        "lint_roots": test_lint_roots,
        "warnings": [],
        "limitations": [
            "Python test lint-unused is advisory in the dead-code report; the quality gate already enforces Ruff unused checks for tests."
        ],
        "findings": test_lint_findings,
    }
    test_lint_path = output_dir / "python-tests.json"
    write_json(test_lint_path, test_lint_report)

    public_import_modules, public_module_warnings = (
        resolve_python_public_import_modules(public_modules)
    )
    root_import_modules = dedupe_strings(
        [*public_import_modules, *package_import_modules]
    )
    coverage_payload, coverage_commands = collect_python_root_coverage(
        entrypoint_commands=entrypoint_commands,
        root_import_modules=root_import_modules,
        root_script_paths=plugin_backend_entrypoints,
        generated_globs=generated_globs,
    )
    vulture_command = [
        sys.executable,
        "-m",
        "vulture",
        *effective_reachability_roots,
        "--min-confidence",
        str(vulture_min_confidence),
    ]
    vulture_completed = run_command(vulture_command, allowed_exit_codes={0, 3})
    reachability_findings = normalize_python_vulture_findings(
        output=vulture_completed.stdout,
        coverage_files=coverage_payload["files"],
        generated_globs=generated_globs,
        public_modules=public_modules,
        analyzed_roots=effective_reachability_roots,
    )
    reachability_limitations = [
        "Python reachability is advisory: findings come from vulture candidates filtered by configured roots and coverage from real package/public roots, not from a full static call graph.",
    ]
    reachability_warnings = (
        public_module_warnings + package_root_warnings + plugin_backend_warnings
    )
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
        "reachability_roots": effective_reachability_roots,
        "configured_reachability_roots": reachability_roots,
        "entrypoint_commands": entrypoint_commands,
        "public_modules": public_modules,
        "public_import_modules": public_import_modules,
        "package_import_modules": package_import_modules,
        "plugin_backend_entrypoints": plugin_backend_entrypoints,
        "warnings": reachability_warnings,
        "limitations": reachability_limitations,
        "coverage_summary": coverage_payload["summary"],
        "findings": reachability_findings,
    }
    reachability_path = output_dir / "python-reachability.json"
    write_json(reachability_path, reachability_report)

    test_vulture_command = [
        sys.executable,
        "-m",
        "vulture",
        *test_reachability_roots,
        "--min-confidence",
        str(vulture_min_confidence),
    ]
    test_vulture_completed = run_command(
        test_vulture_command, allowed_exit_codes={0, 3}
    )
    test_reachability_findings = normalize_python_vulture_findings(
        output=test_vulture_completed.stdout,
        coverage_files={},
        generated_globs=generated_globs,
        public_modules=[],
        analyzed_roots=test_reachability_roots,
        root_scope="test",
        bucket="test-dead",
    )
    test_reachability_limitations = [
        "Python test reachability is advisory: findings come from Vulture over configured test roots and are not coverage-filtered.",
        "Pytest fixtures, parametrization, monkeypatching, subprocess scripts, and protocol fixtures require manual review before deleting candidates.",
    ]
    test_reachability_report = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at,
        "language": "python",
        "lane": "reachability",
        "tool": "vulture",
        "scope": "test",
        "commands": [command_display(test_vulture_command)],
        "vulture_version": vulture_version,
        "vulture_min_confidence": vulture_min_confidence,
        "reachability_roots": test_reachability_roots,
        "warnings": [],
        "limitations": test_reachability_limitations,
        "findings": test_reachability_findings,
    }
    test_reachability_path = output_dir / "python-test-reachability.json"
    write_json(test_reachability_path, test_reachability_report)

    return {
        "findings": dedupe_findings(
            lint_findings
            + test_lint_findings
            + reachability_findings
            + test_reachability_findings
        ),
        "warnings": reachability_warnings,
        "limitations": reachability_limitations + test_reachability_limitations,
        "report_paths": [
            {"language": "python", "path": relative_path(lint_path)},
            {"language": "python", "path": relative_path(test_lint_path)},
            {"language": "python", "path": relative_path(reachability_path)},
            {
                "language": "python",
                "path": relative_path(test_reachability_path),
            },
        ],
        "tool_status": {
            "lint_unused": "ok",
            "test_lint_unused": "ok",
            "reachability": "ok",
            "test_reachability": "ok",
            "lint_roots": lint_roots,
            "test_lint_roots": test_lint_roots,
            "reachability_roots": effective_reachability_roots,
            "configured_reachability_roots": reachability_roots,
            "test_reachability_roots": test_reachability_roots,
            "entrypoint_commands": entrypoint_commands,
            "public_modules": public_modules,
            "public_import_modules": public_import_modules,
            "package_import_modules": package_import_modules,
            "plugin_backend_entrypoints": plugin_backend_entrypoints,
            "coverage_version": coverage_version,
            "vulture_version": vulture_version,
        },
    }


def normalize_python_ruff_findings(
    raw_findings: list[dict[str, Any]],
    generated_globs: list[str],
    *,
    root_scope: str | None = None,
    bucket: str = "lint-unused",
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
                "bucket": bucket,
                "tool": "ruff",
                "confidence": "high",
                "root_scope": root_scope,
                "definition_scope": python_definition_scope(path),
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


def config_command_list(
    config: dict[str, Any],
    key: str,
    default: list[list[str]],
) -> list[list[str]]:
    value = config.get(key, default)
    if not isinstance(value, list):
        raise TypeError(f"Dead code config key {key!r} must be a list of commands.")
    commands: list[list[str]] = []
    for index, command in enumerate(value):
        if not isinstance(command, list) or not all(
            isinstance(part, str) and part for part in command
        ):
            raise TypeError(
                f"Dead code config key {key!r} command {index} must be a list of non-empty strings."
            )
        commands.append(list(command))
    return commands


def resolve_python_public_import_modules(
    public_modules: list[str],
) -> tuple[list[str], list[str]]:
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
    if (
        len(parts) < 3
        or parts[0] != "backend"
        or parts[1] != "setta"
        or module_path.suffix != ".py"
    ):
        raise ValueError(
            f"Python public module path must live under backend/setta and end with .py: {path}"
        )
    module_parts = list(module_path.with_suffix("").parts[2:])
    if not module_parts:
        raise ValueError(
            f"Python public module path did not resolve to a module: {path}"
        )
    if module_parts[-1] == "__init__":
        module_parts = module_parts[:-1]
    return ".".join(["setta", *module_parts]) if module_parts else "setta"


def discover_python_package_import_modules() -> tuple[list[str], list[str]]:
    pyproject_path = ROOT_DIR / "pyproject.toml"
    warnings: list[str] = []
    modules: list[str] = []
    if not pyproject_path.exists():
        return [], [
            f"Python pyproject file was not found: {relative_path(pyproject_path)}"
        ]

    with pyproject_path.open("rb") as handle:
        pyproject = tomllib.load(handle)

    modules.extend(discover_python_project_script_modules(pyproject, warnings))
    main_module_path = ROOT_DIR / "backend" / "setta" / "__main__.py"
    if main_module_path.exists():
        modules.append("setta")
    else:
        warnings.append(
            f"Python module entrypoint was not found: {relative_path(main_module_path)}"
        )
    modules.extend(discover_python_wheel_include_modules(pyproject, warnings))

    return dedupe_strings(modules), sorted(dict.fromkeys(warnings))


def discover_python_project_script_modules(
    pyproject: dict[str, Any],
    warnings: list[str],
) -> list[str]:
    modules: list[str] = []
    project = pyproject.get("project", {})
    if isinstance(project, dict):
        scripts = project.get("scripts", {})
        if isinstance(scripts, dict):
            for script_name, target in sorted(scripts.items()):
                module_name = python_module_name_from_entrypoint_target(str(target))
                if module_name:
                    modules.append(module_name)
                else:
                    warnings.append(
                        f"Python project script {script_name!r} has an unsupported entrypoint target: {target!r}"
                    )

    return modules


def discover_python_wheel_include_modules(
    pyproject: dict[str, Any],
    warnings: list[str],
) -> list[str]:
    modules: list[str] = []
    wheel_config = (
        pyproject.get("tool", {})
        .get("hatch", {})
        .get("build", {})
        .get("targets", {})
        .get("wheel", {})
    )
    only_include = wheel_config.get("only-include", [])
    if isinstance(only_include, list):
        for raw_path in only_include:
            if not isinstance(raw_path, str):
                continue
            modules.extend(python_modules_from_wheel_include(raw_path, warnings))

    return modules


def python_module_name_from_entrypoint_target(target: str) -> str | None:
    module_name = target.split(":", 1)[0].strip()
    if not module_name:
        return None
    return module_name


def python_modules_from_wheel_include(
    include_path: str,
    warnings: list[str],
) -> list[str]:
    path = ROOT_DIR / include_path
    if include_path.endswith(".py"):
        try:
            return [python_module_name_from_path(include_path)]
        except ValueError as exc:
            warnings.append(str(exc))
            return []
    if not path.exists() or not path.is_dir():
        return []
    modules: list[str] = []
    for module_path in sorted(path.rglob("*.py")):
        if "__pycache__" in module_path.parts:
            continue
        try:
            modules.append(python_module_name_from_path(relative_path(module_path)))
        except ValueError as exc:
            warnings.append(str(exc))
    return modules


def discover_python_plugin_backend_entrypoints() -> tuple[list[str], list[str]]:
    plugins_root = ROOT_DIR / "plugins"
    if not plugins_root.exists():
        return [], []

    entrypoints: list[str] = []
    warnings: list[str] = []
    for manifest_path in sorted(plugins_root.glob("*/setta.plugin.json")):
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            warnings.append(
                f"Failed to parse plugin manifest {relative_path(manifest_path)}: {exc}"
            )
            continue
        backend = manifest.get("backend", {})
        if not isinstance(backend, dict):
            continue
        raw_entrypoint = str(backend.get("entrypoint", "")).strip()
        if not raw_entrypoint or not raw_entrypoint.endswith(".py"):
            continue
        entrypoint_path = manifest_path.parent / raw_entrypoint
        if not entrypoint_path.exists() or not entrypoint_path.is_file():
            warnings.append(
                f"Plugin backend entrypoint was not found: {relative_path(entrypoint_path)}"
            )
            continue
        entrypoints.append(relative_path(entrypoint_path))

    return sorted(dict.fromkeys(entrypoints)), sorted(dict.fromkeys(warnings))


def collect_python_root_coverage(
    *,
    entrypoint_commands: list[list[str]],
    root_import_modules: list[str],
    root_script_paths: list[str],
    generated_globs: list[str],
) -> tuple[dict[str, Any], list[str]]:
    coverage_base = [sys.executable, "-m", "coverage"]
    command_displays: list[str] = []

    with tempfile.TemporaryDirectory(
        prefix="setta-deadcode-python-coverage-"
    ) as temp_dir:
        temp_dir_path = Path(temp_dir)
        coverage_env = {**os.environ, "COVERAGE_FILE": str(temp_dir_path / ".coverage")}
        coverage_json_path = temp_dir_path / "coverage.json"
        root_import_path = temp_dir_path / "python_root_imports.py"
        root_import_path.write_text(
            "".join(f"import {module_name}\n" for module_name in root_import_modules),
            encoding="utf-8",
        )
        root_scripts_path = temp_dir_path / "python_root_scripts.py"
        root_scripts_path.write_text(
            "\n".join(
                [
                    "from pathlib import Path",
                    "import runpy",
                    f"ROOT_DIR = Path({str(ROOT_DIR)!r})",
                    *(
                        f"runpy.run_path(str(ROOT_DIR / {script_path!r}))"
                        for script_path in root_script_paths
                    ),
                    "",
                ]
            ),
            encoding="utf-8",
        )

        commands = [
            [*coverage_base, "erase"],
            *(
                [*coverage_base, "run", "--append", *entrypoint_command]
                for entrypoint_command in entrypoint_commands
            ),
            [*coverage_base, "run", "--append", str(root_import_path)],
            [*coverage_base, "run", "--append", str(root_scripts_path)],
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
                        *root_script_paths,
                    ]
                ),
            ],
        ]
        for command in commands:
            run_command(command, env=coverage_env)
            command_displays.append(
                display_python_coverage_command(
                    command,
                    root_import_path=root_import_path,
                    root_scripts_path=root_scripts_path,
                    coverage_json_path=coverage_json_path,
                )
            )

        payload = json.loads(coverage_json_path.read_text(encoding="utf-8"))
    files = normalize_python_coverage_files(payload, generated_globs)
    executed_file_count = sum(
        1 for record in files.values() if record["executed_lines"]
    )
    return (
        {
            "files": files,
            "summary": {
                "executed_root_command_count": len(entrypoint_commands) + 2,
                "entrypoint_command_count": len(entrypoint_commands),
                "root_import_module_count": len(root_import_modules),
                "root_script_path_count": len(root_script_paths),
                "covered_file_count": len(files),
                "executed_file_count": executed_file_count,
            },
        },
        command_displays,
    )


def display_python_coverage_command(
    command: list[str],
    *,
    root_import_path: Path,
    root_scripts_path: Path,
    coverage_json_path: Path,
) -> str:
    replacements = {
        str(root_import_path): "<temp-python-root-imports.py>",
        str(root_scripts_path): "<temp-python-root-scripts.py>",
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
        if not path.startswith("backend/setta/") or matches_any_glob(
            path, generated_globs
        ):
            continue
        files[path] = {
            "executed_lines": sorted(
                int(line) for line in record.get("executed_lines", [])
            ),
            "missing_lines": sorted(
                int(line) for line in record.get("missing_lines", [])
            ),
        }
    return dict(sorted(files.items()))


def normalize_python_vulture_findings(
    *,
    output: str,
    coverage_files: dict[str, dict[str, list[int]]],
    generated_globs: list[str],
    public_modules: list[str],
    analyzed_roots: list[str],
    root_scope: str = "prod",
    bucket: str = "prod-dead",
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
            or not path_is_under_roots(path, analyzed_roots)
            or matches_any_glob(path, generated_globs)
            or path in public_module_set
        ):
            continue
        line_number = int(match.group("line"))
        coverage_record = coverage_files.get(
            path, {"executed_lines": [], "missing_lines": []}
        )
        executed_lines = set(coverage_record.get("executed_lines", []))
        if line_number in executed_lines:
            continue
        evidence = [f"reported by vulture ({match.group('confidence')}% confidence)"]
        file_executed = bool(executed_lines)
        if coverage_files and file_executed:
            evidence.append("candidate line was not executed while exercising roots")
        elif coverage_files:
            evidence.append("file was not executed while exercising roots")
        else:
            evidence.append("advisory vulture report is not coverage-filtered")
        findings.append(
            {
                "language": "python",
                "lane": "reachability",
                "bucket": bucket,
                "tool": "vulture",
                "confidence": "medium",
                "root_scope": root_scope,
                "definition_scope": python_definition_scope(path),
                "path": path,
                "line": line_number,
                "column": None,
                "symbol": match.group("symbol"),
                "kind": match.group("kind"),
                "vulture_confidence": int(match.group("confidence")),
                "file_executed_in_root_coverage": file_executed,
                "evidence": evidence,
            }
        )
    return dedupe_findings(findings)


def path_is_under_roots(path: str, roots: list[str]) -> bool:
    normalized_roots = [root.rstrip("/") for root in roots if root]
    return any(path == root or path.startswith(f"{root}/") for root in normalized_roots)


def python_definition_scope(path: str) -> str:
    return "test" if path == "tests" or path.startswith("tests/") else "production"


def dedupe_strings(values: list[str]) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        deduped.append(value)
    return deduped
