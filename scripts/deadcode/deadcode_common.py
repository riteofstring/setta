#!/usr/bin/env python
from __future__ import annotations

import fnmatch
import json
import re
import subprocess
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

ROOT_DIR = Path(__file__).resolve().parents[2]
SCHEMA_VERSION = 1


def load_config(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"Dead code config not found: {path}")
    with path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    if not isinstance(data, dict):
        raise TypeError(f"Dead code config must be a mapping: {path}")
    return data


def config_string_list(
    config: dict[str, Any],
    key: str,
    default: list[str],
) -> list[str]:
    value = config.get(key, default)
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise TypeError(f"Dead code config key {key!r} must be a list of strings.")
    return list(value)


def resolve_generated_globs(
    language: str,
    config: dict[str, Any],
    fallback: list[str],
) -> list[str]:
    return dedupe_strings(
        [
            *fallback,
            *quality_generated_globs(language),
            *config_string_list(config, "generated_globs", []),
        ]
    )


def quality_generated_globs(language: str) -> list[str]:
    quality_paths_config_path = ROOT_DIR / "quality.paths.yaml"
    if not quality_paths_config_path.exists():
        return []
    with quality_paths_config_path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    if not isinstance(data, dict):
        raise TypeError(
            f"Quality path config must be a mapping: {quality_paths_config_path}"
        )

    section = data.get(language, {})
    if not isinstance(section, dict):
        raise TypeError(f"Quality path config key {language!r} must be a mapping.")
    return config_string_list(section, "generated_globs", [])


def dedupe_strings(values: list[str]) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        deduped.append(value)
    return deduped


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
    resolved = path.resolve(strict=False)
    try:
        return resolved.relative_to(ROOT_DIR).as_posix()
    except ValueError:
        return resolved.as_posix()


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
        finding.get("bucket"),
        finding.get("root_scope"),
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
