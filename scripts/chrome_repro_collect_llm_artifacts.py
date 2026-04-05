#!/usr/bin/env python3

import argparse
import json
import re
import shutil
from collections import OrderedDict
from collections.abc import Callable, Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

SENSITIVE_KEY_NAMES = {
    "authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "apikey",
    "api_key",
    "access_token",
    "refresh_token",
    "token",
}
SESSION_ROOT_BY_TOOL_TYPE = {
    "codex": "codex",
}
SAFE_TOP_LEVEL_SESSION_FILES = ("config.toml",)
SAFE_SESSION_SUBDIRS = ("log",)
SAFE_SESSION_GLOB_PATTERNS = ("sessions/**/*.jsonl",)
OMITTED_SESSION_PATH_HINTS = (
    "auth.json",
    "logs_*.sqlite*",
    "state_*.sqlite*",
    "shell_snapshots/",
    "tmp/",
    ".tmp/",
    "memories/",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Collect redacted generated external-agent artifacts referenced by a "
            "Chrome repro recording bundle."
        )
    )
    parser.add_argument("--artifact-dir", required=True)
    parser.add_argument("--setta-files-root", required=True)
    return parser.parse_args()


def load_json_file(path: Path) -> Any:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def normalize_string(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip()


def normalize_key_name(key: str) -> str:
    return key.strip().lower().replace("_", "-")


def is_sensitive_key(key: str) -> bool:
    normalized = normalize_key_name(key)
    if normalized in SENSITIVE_KEY_NAMES:
        return True
    return normalized.endswith("-token")


def sanitize_value(value: Any, key: str | None = None) -> Any:
    if key is not None and is_sensitive_key(key):
        return "<redacted>"
    if isinstance(value, dict):
        return {
            nested_key: sanitize_value(nested_value, nested_key)
            for nested_key, nested_value in value.items()
        }
    if isinstance(value, list):
        return [sanitize_value(item) for item in value]
    return value


def redact_toml_text(content: str) -> str:
    pattern = re.compile(r"^(\s*([A-Za-z0-9_.-]+)\s*=\s*)(.*)$")
    lines: list[str] = []
    for raw_line in content.splitlines():
        match = pattern.match(raw_line)
        if match and is_sensitive_key(match.group(2)):
            lines.append(f"{match.group(1)}'<redacted>'")
            continue
        lines.append(raw_line)
    trailing_newline = "\n" if content.endswith("\n") else ""
    return "\n".join(lines) + trailing_newline


def write_sanitized_json_copy(source: Path, destination: Path) -> None:
    payload = load_json_file(source)
    if payload is None:
        shutil.copy2(source, destination)
        return
    destination.write_text(
        json.dumps(sanitize_value(payload), indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )


def iter_sanitized_jsonl_lines(source: Path) -> Iterator[str]:
    for raw_line in source.read_text(encoding="utf-8").splitlines():
        if not raw_line.strip():
            continue
        try:
            payload = json.loads(raw_line)
        except json.JSONDecodeError:
            yield raw_line
            continue
        yield json.dumps(sanitize_value(payload), ensure_ascii=True)


def write_sanitized_jsonl_copy(source: Path, destination: Path) -> None:
    sanitized_lines = list(iter_sanitized_jsonl_lines(source))
    destination.write_text(
        "\n".join(sanitized_lines) + ("\n" if sanitized_lines else ""),
        encoding="utf-8",
    )


def write_sanitized_toml_copy(source: Path, destination: Path) -> None:
    destination.write_text(
        redact_toml_text(source.read_text(encoding="utf-8")),
        encoding="utf-8",
    )


SANITIZED_COPY_WRITERS: dict[str, Callable[[Path, Path], None]] = {
    ".json": write_sanitized_json_copy,
    ".jsonl": write_sanitized_jsonl_copy,
    ".toml": write_sanitized_toml_copy,
}


def write_sanitized_copy(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    writer = SANITIZED_COPY_WRITERS.get(source.suffix)
    if writer is None:
        shutil.copy2(source, destination)
        return
    writer(source, destination)


def iter_json_object_lines(path: Path) -> Iterator[dict[str, Any]]:
    if not path.is_file():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        if not raw_line.strip():
            continue
        try:
            payload = json.loads(raw_line)
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            yield payload


def build_external_agent_run_update(payload: dict[str, Any]) -> dict[str, str] | None:
    event = payload.get("event")
    if not isinstance(event, dict):
        return None
    detail_json = event.get("detailJson")
    if (
        not isinstance(detail_json, dict)
        or detail_json.get("messageType") != "AgentRunUpdated"
    ):
        return None
    content = detail_json.get("content")
    if not isinstance(content, dict):
        return None
    inputs = content.get("inputs")
    if (
        not isinstance(inputs, dict)
        or normalize_string(inputs.get("runType")) != "external_agent"
    ):
        return None
    run_id = normalize_string(content.get("id"))
    if run_id == "":
        return None
    outputs = content.get("outputs")
    thread_id = ""
    if isinstance(outputs, dict):
        thread_id = normalize_string(outputs.get("threadId"))
    return {
        "runId": run_id,
        "chatId": normalize_string(inputs.get("chatId")),
        "engineConfigId": normalize_string(inputs.get("engineConfigId")),
        "threadId": thread_id,
    }


def merge_recorded_run_update(
    runs: "OrderedDict[str, dict[str, str]]", update: dict[str, str]
) -> None:
    run_id = update["runId"]
    entry = runs.setdefault(
        run_id,
        {
            "runId": run_id,
            "chatId": "",
            "engineConfigId": "",
            "threadId": "",
        },
    )
    for key in ("chatId", "engineConfigId", "threadId"):
        if entry[key] == "" and update[key] != "":
            entry[key] = update[key]


def extract_recorded_external_agent_runs(artifact_dir: Path) -> list[dict[str, str]]:
    transport_details_path = artifact_dir / "transport_details.ndjson"
    runs: "OrderedDict[str, dict[str, str]]" = OrderedDict()
    for payload in iter_json_object_lines(transport_details_path):
        update = build_external_agent_run_update(payload)
        if update is None:
            continue
        merge_recorded_run_update(runs, update)
    return list(runs.values())


def build_engine_lookup(payload: Any) -> dict[str, dict[str, Any]]:
    if not isinstance(payload, list):
        return {}
    lookup: dict[str, dict[str, Any]] = {}
    for item in payload:
        if not isinstance(item, dict):
            continue
        config_id = normalize_string(item.get("id"))
        if config_id == "":
            continue
        lookup[config_id] = item
    return lookup


def collect_session_artifacts(
    source_root: Path,
    destination_root: Path,
    llm_artifacts_dir: Path,
    copied_files: list[str],
) -> None:
    for source_path in iter_safe_session_source_paths(source_root):
        destination_path = destination_root / source_path.relative_to(source_root)
        write_sanitized_copy(source_path, destination_path)
        copied_files.append(str(destination_path.relative_to(llm_artifacts_dir)))


def iter_safe_session_source_paths(source_root: Path) -> Iterator[Path]:
    for file_name in SAFE_TOP_LEVEL_SESSION_FILES:
        source_path = source_root / file_name
        if not source_path.is_file():
            continue
        yield source_path

    for directory_name in SAFE_SESSION_SUBDIRS:
        source_dir = source_root / directory_name
        if not source_dir.is_dir():
            continue
        yield from sorted(path for path in source_dir.rglob("*") if path.is_file())

    for pattern in SAFE_SESSION_GLOB_PATTERNS:
        yield from sorted(path for path in source_root.glob(pattern) if path.is_file())


def build_manifest(artifact_dir: Path, setta_files_root: Path) -> dict[str, Any]:
    return {
        "format": "setta.chrome-repro-llm-artifacts/v1",
        "createdAt": datetime.now(UTC).isoformat(),
        "artifactDir": str(artifact_dir),
        "settaFilesRoot": str(setta_files_root),
        "recordedRuns": [],
        "issues": [],
    }


def write_manifest(llm_artifacts_dir: Path, manifest: dict[str, Any]) -> None:
    (llm_artifacts_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )


def build_copied_run_entry(recorded_run: dict[str, str]) -> dict[str, Any]:
    return {
        "runId": recorded_run["runId"],
        "chatId": recorded_run["chatId"],
        "engineConfigId": recorded_run["engineConfigId"],
        "threadId": recorded_run["threadId"],
        "copiedFiles": [],
        "omittedPathHints": list(OMITTED_SESSION_PATH_HINTS),
    }


def copy_run_artifact(
    run_id: str,
    agent_runs_source: Path,
    llm_artifacts_dir: Path,
    copied_entry: dict[str, Any],
) -> None:
    run_source_path = agent_runs_source / f"{run_id}.json"
    run_destination_path = llm_artifacts_dir / "agent_runs" / f"{run_id}.json"
    if not run_source_path.is_file():
        copied_entry["missingRunFile"] = str(run_source_path)
        return
    write_sanitized_copy(run_source_path, run_destination_path)
    copied_entry["copiedFiles"].append(
        str(run_destination_path.relative_to(llm_artifacts_dir))
    )


def resolve_external_agent_config_id(
    engine_payload: Any, copied_entry: dict[str, Any]
) -> str:
    if not isinstance(engine_payload, dict):
        return ""
    if engine_payload:
        copied_entry["engineConfig"] = sanitize_value(engine_payload)
    return normalize_string(engine_payload.get("externalAgentConfigId"))


def resolve_session_source_root(
    setta_files_root: Path,
    recorded_run: dict[str, str],
    external_agent_config_id: str,
    external_agent_payload: Any,
    copied_entry: dict[str, Any],
) -> tuple[str, Path] | None:
    if isinstance(external_agent_payload, dict) and external_agent_payload:
        copied_entry["externalAgentConfig"] = sanitize_value(external_agent_payload)

    tool_type = normalize_string(
        external_agent_payload.get("toolType")
        if isinstance(external_agent_payload, dict)
        else None
    )
    runtime_root_name = SESSION_ROOT_BY_TOOL_TYPE.get(tool_type)
    if runtime_root_name is None:
        copied_entry["unsupportedToolType"] = tool_type
        return None

    chat_id = recorded_run["chatId"]
    if chat_id == "":
        copied_entry["missingChatID"] = True
        return None

    session_source_root = (
        setta_files_root
        / "external_agent_settings"
        / runtime_root_name
        / external_agent_config_id
        / "sessions"
        / chat_id
    )
    if not session_source_root.is_dir():
        copied_entry["missingSessionRoot"] = str(session_source_root)
        return None
    return runtime_root_name, session_source_root


def collect_recorded_run_artifacts(
    recorded_run: dict[str, str],
    setta_files_root: Path,
    llm_artifacts_dir: Path,
    engine_lookup: dict[str, dict[str, Any]],
    external_agent_lookup: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    copied_entry = build_copied_run_entry(recorded_run)
    copy_run_artifact(
        recorded_run["runId"],
        setta_files_root / "agent_runs",
        llm_artifacts_dir,
        copied_entry,
    )

    external_agent_config_id = resolve_external_agent_config_id(
        engine_lookup.get(recorded_run["engineConfigId"], {}),
        copied_entry,
    )
    if external_agent_config_id == "":
        return copied_entry

    session_source = resolve_session_source_root(
        setta_files_root,
        recorded_run,
        external_agent_config_id,
        external_agent_lookup.get(external_agent_config_id, {}),
        copied_entry,
    )
    if session_source is None:
        return copied_entry

    runtime_root_name, session_source_root = session_source
    session_destination_root = (
        llm_artifacts_dir
        / "external_agent_settings"
        / runtime_root_name
        / external_agent_config_id
        / "sessions"
        / recorded_run["chatId"]
    )
    collect_session_artifacts(
        session_source_root,
        session_destination_root,
        llm_artifacts_dir,
        copied_entry["copiedFiles"],
    )
    copied_entry["sessionArtifactRoot"] = str(
        session_destination_root.relative_to(llm_artifacts_dir)
    )
    return copied_entry


def main() -> int:
    args = parse_args()
    artifact_dir = Path(args.artifact_dir).resolve()
    setta_files_root = Path(args.setta_files_root).resolve()
    llm_artifacts_dir = artifact_dir / "llm_engine_artifacts"
    llm_artifacts_dir.mkdir(parents=True, exist_ok=True)

    manifest = build_manifest(artifact_dir, setta_files_root)

    if not setta_files_root.is_dir():
        manifest["issues"].append(
            f"setta files root does not exist: {setta_files_root}"
        )
        write_manifest(llm_artifacts_dir, manifest)
        return 0

    recorded_runs = extract_recorded_external_agent_runs(artifact_dir)
    manifest["recordedRuns"] = recorded_runs

    engine_lookup = build_engine_lookup(
        load_json_file(setta_files_root / "engine_configs.json")
    )
    external_agent_lookup = build_engine_lookup(
        load_json_file(setta_files_root / "external_agents.json")
    )

    copied_runs = [
        collect_recorded_run_artifacts(
            recorded_run,
            setta_files_root,
            llm_artifacts_dir,
            engine_lookup,
            external_agent_lookup,
        )
        for recorded_run in recorded_runs
    ]
    manifest["copiedRuns"] = copied_runs
    manifest["copiedRunCount"] = len(copied_runs)
    write_manifest(llm_artifacts_dir, manifest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
