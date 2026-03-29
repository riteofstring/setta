#!/usr/bin/env python3

import argparse
import json
import re
import shutil
from collections import OrderedDict
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
    "opencode": "opencode",
}
SAFE_TOP_LEVEL_SESSION_FILES = ("config.toml", "opencode.json")
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


def write_sanitized_copy(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if source.suffix == ".json":
        payload = load_json_file(source)
        if payload is None:
            shutil.copy2(source, destination)
            return
        sanitized = sanitize_value(payload)
        destination.write_text(
            json.dumps(sanitized, indent=2, ensure_ascii=True) + "\n", encoding="utf-8"
        )
        return
    if source.suffix == ".jsonl":
        sanitized_lines: list[str] = []
        for raw_line in source.read_text(encoding="utf-8").splitlines():
            if not raw_line.strip():
                continue
            try:
                payload = json.loads(raw_line)
            except json.JSONDecodeError:
                sanitized_lines.append(raw_line)
                continue
            sanitized_lines.append(
                json.dumps(sanitize_value(payload), ensure_ascii=True)
            )
        destination.write_text(
            "\n".join(sanitized_lines) + ("\n" if sanitized_lines else ""),
            encoding="utf-8",
        )
        return
    if source.suffix == ".toml":
        destination.write_text(
            redact_toml_text(source.read_text(encoding="utf-8")), encoding="utf-8"
        )
        return
    shutil.copy2(source, destination)


def extract_recorded_external_agent_runs(artifact_dir: Path) -> list[dict[str, str]]:
    transport_details_path = artifact_dir / "transport_details.ndjson"
    if not transport_details_path.is_file():
        return []
    runs: "OrderedDict[str, dict[str, str]]" = OrderedDict()
    for raw_line in transport_details_path.read_text(encoding="utf-8").splitlines():
        if not raw_line.strip():
            continue
        try:
            payload = json.loads(raw_line)
        except json.JSONDecodeError:
            continue
        event = payload.get("event")
        if not isinstance(event, dict):
            continue
        detail_json = event.get("detailJson")
        if not isinstance(detail_json, dict):
            continue
        if detail_json.get("messageType") != "AgentRunUpdated":
            continue
        content = detail_json.get("content")
        if not isinstance(content, dict):
            continue
        inputs = content.get("inputs")
        if (
            not isinstance(inputs, dict)
            or normalize_string(inputs.get("runType")) != "external_agent"
        ):
            continue
        run_id = normalize_string(content.get("id"))
        if run_id == "":
            continue
        outputs = content.get("outputs")
        thread_id = ""
        if isinstance(outputs, dict):
            thread_id = normalize_string(outputs.get("threadId"))
        entry = runs.setdefault(
            run_id,
            {
                "runId": run_id,
                "chatId": normalize_string(inputs.get("chatId")),
                "engineConfigId": normalize_string(inputs.get("engineConfigId")),
                "threadId": thread_id,
            },
        )
        if entry["chatId"] == "":
            entry["chatId"] = normalize_string(inputs.get("chatId"))
        if entry["engineConfigId"] == "":
            entry["engineConfigId"] = normalize_string(inputs.get("engineConfigId"))
        if entry["threadId"] == "" and thread_id != "":
            entry["threadId"] = thread_id
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
    for file_name in SAFE_TOP_LEVEL_SESSION_FILES:
        source_path = source_root / file_name
        if not source_path.is_file():
            continue
        destination_path = destination_root / file_name
        write_sanitized_copy(source_path, destination_path)
        copied_files.append(str(destination_path.relative_to(llm_artifacts_dir)))

    for directory_name in SAFE_SESSION_SUBDIRS:
        source_dir = source_root / directory_name
        if not source_dir.is_dir():
            continue
        for source_path in sorted(
            path for path in source_dir.rglob("*") if path.is_file()
        ):
            destination_path = destination_root / source_path.relative_to(source_root)
            write_sanitized_copy(source_path, destination_path)
            copied_files.append(str(destination_path.relative_to(llm_artifacts_dir)))

    for pattern in SAFE_SESSION_GLOB_PATTERNS:
        for source_path in sorted(source_root.glob(pattern)):
            if not source_path.is_file():
                continue
            destination_path = destination_root / source_path.relative_to(source_root)
            write_sanitized_copy(source_path, destination_path)
            copied_files.append(str(destination_path.relative_to(llm_artifacts_dir)))


def main() -> int:
    args = parse_args()
    artifact_dir = Path(args.artifact_dir).resolve()
    setta_files_root = Path(args.setta_files_root).resolve()
    llm_artifacts_dir = artifact_dir / "llm_engine_artifacts"
    llm_artifacts_dir.mkdir(parents=True, exist_ok=True)

    manifest: dict[str, Any] = {
        "format": "setta.chrome-repro-llm-artifacts/v1",
        "createdAt": datetime.now(UTC).isoformat(),
        "artifactDir": str(artifact_dir),
        "settaFilesRoot": str(setta_files_root),
        "recordedRuns": [],
        "issues": [],
    }

    if not setta_files_root.is_dir():
        manifest["issues"].append(
            f"setta files root does not exist: {setta_files_root}"
        )
        (llm_artifacts_dir / "manifest.json").write_text(
            json.dumps(manifest, indent=2, ensure_ascii=True) + "\n",
            encoding="utf-8",
        )
        return 0

    recorded_runs = extract_recorded_external_agent_runs(artifact_dir)
    manifest["recordedRuns"] = recorded_runs

    engine_lookup = build_engine_lookup(
        load_json_file(setta_files_root / "engine_configs.json")
    )
    external_agent_lookup = build_engine_lookup(
        load_json_file(setta_files_root / "external_agents.json")
    )

    agent_runs_source = setta_files_root / "agent_runs"
    copied_runs: list[dict[str, Any]] = []

    for recorded_run in recorded_runs:
        run_id = recorded_run["runId"]
        copied_entry: dict[str, Any] = {
            "runId": run_id,
            "chatId": recorded_run["chatId"],
            "engineConfigId": recorded_run["engineConfigId"],
            "threadId": recorded_run["threadId"],
            "copiedFiles": [],
            "omittedPathHints": list(OMITTED_SESSION_PATH_HINTS),
        }

        run_source_path = agent_runs_source / f"{run_id}.json"
        run_destination_path = llm_artifacts_dir / "agent_runs" / f"{run_id}.json"
        if run_source_path.is_file():
            write_sanitized_copy(run_source_path, run_destination_path)
            copied_entry["copiedFiles"].append(
                str(run_destination_path.relative_to(llm_artifacts_dir))
            )
        else:
            copied_entry["missingRunFile"] = str(run_source_path)

        engine_payload = engine_lookup.get(recorded_run["engineConfigId"], {})
        if engine_payload:
            copied_entry["engineConfig"] = sanitize_value(engine_payload)
        external_agent_config_id = normalize_string(
            engine_payload.get("externalAgentConfigId")
            if isinstance(engine_payload, dict)
            else None
        )
        if external_agent_config_id == "":
            copied_runs.append(copied_entry)
            continue

        external_agent_payload = external_agent_lookup.get(external_agent_config_id, {})
        if external_agent_payload:
            copied_entry["externalAgentConfig"] = sanitize_value(external_agent_payload)
        tool_type = normalize_string(
            external_agent_payload.get("toolType")
            if isinstance(external_agent_payload, dict)
            else None
        )
        runtime_root_name = SESSION_ROOT_BY_TOOL_TYPE.get(tool_type)
        if runtime_root_name is None:
            copied_entry["unsupportedToolType"] = tool_type
            copied_runs.append(copied_entry)
            continue

        chat_id = recorded_run["chatId"]
        if chat_id == "":
            copied_entry["missingChatID"] = True
            copied_runs.append(copied_entry)
            continue

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
            copied_runs.append(copied_entry)
            continue

        session_destination_root = (
            llm_artifacts_dir
            / "external_agent_settings"
            / runtime_root_name
            / external_agent_config_id
            / "sessions"
            / chat_id
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
        copied_runs.append(copied_entry)

    manifest["copiedRuns"] = copied_runs
    manifest["copiedRunCount"] = len(copied_runs)
    (llm_artifacts_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
