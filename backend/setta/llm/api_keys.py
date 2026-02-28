"""Shared helpers for persisting and filtering LLM API keys."""

import hashlib
import json
import os
import re
import tempfile
from dataclasses import dataclass
from io import StringIO
from pathlib import Path
from typing import Literal

from dotenv import dotenv_values

from setta.database.db_objs import DBE
from setta.types.chat import APIKeys
from setta.types.llm_config import AllLLMConfigs
from setta.types.managed_api_keys import ManagedAPIKeysSnapshot

MANAGED_API_KEYS_CORRUPT_ERROR_CODE = "managed_api_keys_store_corrupt"
MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE = "managed_api_keys_store_unavailable"
MANAGED_API_KEYS_REVISION_CONFLICT_ERROR_CODE = "managed_api_keys_revision_conflict"
_MANAGED_API_KEY_NAMES_ENV_VAR = "SETTA_MANAGED_LLM_API_KEY_NAMES"
_DOT_ENV_ASSIGNMENT_PATTERN = re.compile(
    r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*="
)


@dataclass(frozen=True)
class ManagedAPIKeysReadResult:
    api_keys: APIKeys
    revision: int
    corrupt: bool
    error_code: str | None = None
    error: str | None = None


@dataclass(frozen=True)
class ManagedAPIKeysWriteAttempt:
    status: Literal[
        "success", "revision_conflict", "corrupt_store", "store_unavailable"
    ]
    api_keys: APIKeys
    revision: int
    error_code: str | None = None
    error: str | None = None


class ManagedAPIKeysStoreUnavailableError(RuntimeError):
    """API key storage is currently unreadable due to I/O failure."""


class ManagedAPIKeysStoreCorruptError(RuntimeError):
    """API key storage contains an unreadable payload."""


def _normalize_api_key_name(raw_key: str) -> str:
    return raw_key.strip()


def _normalize_api_key_value(raw_value: str) -> str:
    value = raw_value.strip()
    if value == "":
        raise ValueError(".env API key values must be non-empty strings.")
    return value


def _normalize_api_key_write_payload(payload: APIKeys) -> APIKeys:
    normalized: APIKeys = {}
    for raw_key, raw_value in payload.items():
        key = _normalize_api_key_name(raw_key)
        if not key:
            continue
        try:
            normalized[key] = _normalize_api_key_value(raw_value)
        except ValueError:
            continue
    return normalized


def _compute_api_keys_revision(api_keys: APIKeys) -> int:
    if not api_keys:
        return 0
    serialized = json.dumps(api_keys, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    # 13 hex chars = 52 bits, stays safely representable in JS Number.
    revision = int(digest[:13], 16)
    if revision == 0:
        return 1
    return revision


def build_managed_api_keys_snapshot(
    result: ManagedAPIKeysReadResult,
    *,
    api_keys: APIKeys | None = None,
) -> ManagedAPIKeysSnapshot:
    resolved_api_keys = result.api_keys if api_keys is None else api_keys
    return ManagedAPIKeysSnapshot(
        apiKeys=resolved_api_keys,
        revision=result.revision,
        corrupt=result.corrupt,
        errorCode=result.error_code,
        message=result.error,
    )


def _read_dot_env_raw_payload_from_disk(path: Path) -> str | None:
    if not path.exists():
        return None
    try:
        return path.read_text(encoding="utf-8")
    except (UnicodeError, ValueError) as exc:
        raise ManagedAPIKeysStoreCorruptError(
            f".env API key store is not valid UTF-8: {exc}"
        ) from exc
    except OSError as exc:
        raise ManagedAPIKeysStoreUnavailableError(
            f"Failed to read .env API key store: {exc}"
        ) from exc


def _parse_dot_env_payload(raw_payload: str | None) -> dict[str, str]:
    if raw_payload is None:
        return {}
    env_vars = dotenv_values(stream=StringIO(raw_payload))
    normalized: dict[str, str] = {}
    for raw_key, raw_value in env_vars.items():
        if raw_value is None:
            continue
        key = _normalize_api_key_name(raw_key)
        if not key:
            continue
        normalized[key] = raw_value
    return normalized


def _read_dot_env_payload_from_disk(path: Path) -> dict[str, str]:
    raw_payload = _read_dot_env_raw_payload_from_disk(path)
    return _parse_dot_env_payload(raw_payload)


def _parse_managed_api_key_names(raw_value: str | None) -> set[str]:
    if raw_value is None:
        return set()
    if raw_value.strip() == "":
        return set()
    try:
        payload = json.loads(raw_value)
    except (TypeError, ValueError) as exc:
        raise ManagedAPIKeysStoreCorruptError(
            "Managed API key index in .env is not valid JSON."
        ) from exc
    if not isinstance(payload, list):
        raise ManagedAPIKeysStoreCorruptError(
            "Managed API key index in .env must be a JSON array."
        )
    names: set[str] = set()
    for raw_name in payload:
        if not isinstance(raw_name, str):
            raise ManagedAPIKeysStoreCorruptError(
                "Managed API key names in .env must be strings."
            )
        normalized_name = _normalize_api_key_name(raw_name)
        if normalized_name:
            names.add(normalized_name)
    return names


def _read_managed_api_keys_from_dot_env_payload(
    env_vars: dict[str, str],
) -> tuple[set[str], APIKeys]:
    managed_key_names = _parse_managed_api_key_names(
        env_vars.get(_MANAGED_API_KEY_NAMES_ENV_VAR)
    )
    managed_api_keys: APIKeys = {}
    for key in managed_key_names:
        raw_value = env_vars.get(key)
        if raw_value is None:
            continue
        try:
            managed_api_keys[key] = _normalize_api_key_value(raw_value)
        except ValueError as exc:
            raise ManagedAPIKeysStoreCorruptError(str(exc)) from exc
    return managed_key_names, managed_api_keys


def _extract_dot_env_assignment_key(line: str) -> str | None:
    match = _DOT_ENV_ASSIGNMENT_PATTERN.match(line)
    if match is None:
        return None
    return match.group(1)


def _serialize_dot_env_assignment_value(value: str) -> str:
    safe_unquoted = re.fullmatch(r"[A-Za-z0-9_./:@%+\-=]+", value)
    if safe_unquoted is not None:
        return value
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    escaped = escaped.replace("\n", "\\n")
    return f'"{escaped}"'


def _resolve_dot_env_newline(raw_payload: str | None) -> str:
    if raw_payload is not None and "\r\n" in raw_payload:
        return "\r\n"
    return "\n"


def _write_dot_env_payload_to_disk(path: Path, content: str) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            mode="w",
            dir=path.parent,
            delete=False,
            suffix=".tmp",
            encoding="utf-8",
        ) as tmp_file:
            tmp_file.write(content)
            tmp_path = Path(tmp_file.name)
        tmp_path.replace(path)
    except OSError as exc:
        raise ManagedAPIKeysStoreUnavailableError(
            f"Failed to write .env API key store: {exc}"
        ) from exc


def _build_next_dot_env_payload(
    *,
    raw_payload: str | None,
    current_managed_key_names: set[str],
    managed_key_names_to_purge: set[str],
    next_managed_api_keys: APIKeys,
) -> str:
    managed_keys_to_remove = set(current_managed_key_names)
    managed_keys_to_remove.update(managed_key_names_to_purge)
    managed_keys_to_remove.add(_MANAGED_API_KEY_NAMES_ENV_VAR)

    preserved_lines: list[str] = []
    if raw_payload is not None:
        for raw_line in raw_payload.splitlines(keepends=True):
            key = _extract_dot_env_assignment_key(raw_line.rstrip("\r\n"))
            if key is not None and key in managed_keys_to_remove:
                continue
            preserved_lines.append(raw_line)

    newline = _resolve_dot_env_newline(raw_payload)
    additions: list[str] = []
    for key, value in sorted(next_managed_api_keys.items()):
        serialized_value = _serialize_dot_env_assignment_value(value)
        additions.append(f"{key}={serialized_value}")
    if next_managed_api_keys:
        additions.append(
            f"{_MANAGED_API_KEY_NAMES_ENV_VAR}="
            f"{json.dumps(sorted(next_managed_api_keys.keys()), separators=(',', ':'))}"
        )

    preserved_content = "".join(preserved_lines)
    if not additions:
        return preserved_content
    if preserved_content and not preserved_content.endswith(("\n", "\r")):
        preserved_content += newline
    return preserved_content + newline.join(additions) + newline


def read_managed_api_keys_with_status(dbe: DBE) -> ManagedAPIKeysReadResult:
    path = dbe.dot_env
    with dbe.get_file_lock(path):
        try:
            env_vars = _read_dot_env_payload_from_disk(path)
        except ManagedAPIKeysStoreUnavailableError as exc:
            return ManagedAPIKeysReadResult(
                api_keys={},
                revision=0,
                corrupt=False,
                error_code=MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE,
                error=str(exc),
            )
        except ManagedAPIKeysStoreCorruptError as exc:
            return ManagedAPIKeysReadResult(
                api_keys={},
                revision=0,
                corrupt=True,
                error_code=MANAGED_API_KEYS_CORRUPT_ERROR_CODE,
                error=str(exc),
            )
        try:
            _managed_key_names, api_keys = _read_managed_api_keys_from_dot_env_payload(
                env_vars
            )
        except ManagedAPIKeysStoreCorruptError as exc:
            return ManagedAPIKeysReadResult(
                api_keys={},
                revision=0,
                corrupt=True,
                error_code=MANAGED_API_KEYS_CORRUPT_ERROR_CODE,
                error=str(exc),
            )
    return ManagedAPIKeysReadResult(
        api_keys=api_keys,
        revision=_compute_api_keys_revision(api_keys),
        corrupt=False,
    )


def read_managed_api_keys(dbe: DBE) -> APIKeys:
    result = read_managed_api_keys_with_status(dbe)
    if result.error_code == MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE:
        if result.error is None:
            raise ValueError(".env API key store is unavailable.")
        raise ValueError(result.error)
    if result.corrupt:
        if result.error is None:
            raise ValueError(".env API key store is corrupt.")
        raise ValueError(result.error)
    return result.api_keys


def write_managed_api_keys_with_expected_revision(
    dbe: DBE,
    payload: APIKeys,
    *,
    expected_revision: int,
    configured_provider_key_names: set[str] | None = None,
) -> ManagedAPIKeysWriteAttempt:
    def _corrupt_result(error: Exception) -> ManagedAPIKeysWriteAttempt:
        return ManagedAPIKeysWriteAttempt(
            status="corrupt_store",
            api_keys={},
            revision=0,
            error_code=MANAGED_API_KEYS_CORRUPT_ERROR_CODE,
            error=str(error),
        )

    def _store_unavailable_result(error: Exception) -> ManagedAPIKeysWriteAttempt:
        return ManagedAPIKeysWriteAttempt(
            status="store_unavailable",
            api_keys={},
            revision=0,
            error_code=MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE,
            error=str(error),
        )

    normalized = _normalize_api_key_write_payload(payload)
    provider_key_names = configured_provider_key_names or set()
    path = dbe.dot_env
    with dbe.get_file_lock(path):
        try:
            raw_dot_env_payload = _read_dot_env_raw_payload_from_disk(path)
            current_env_vars = _parse_dot_env_payload(raw_dot_env_payload)
        except ManagedAPIKeysStoreUnavailableError as exc:
            return _store_unavailable_result(exc)
        except ManagedAPIKeysStoreCorruptError as exc:
            return _corrupt_result(exc)
        managed_key_names_to_purge: set[str] = set()
        try:
            current_managed_key_names, current_api_keys = (
                _read_managed_api_keys_from_dot_env_payload(current_env_vars)
            )
        except ManagedAPIKeysStoreCorruptError as exc:
            if expected_revision != 0:
                return _corrupt_result(exc)
            current_managed_key_names = set()
            current_api_keys = {}
            managed_key_names_to_purge = set(provider_key_names)
        current_revision = _compute_api_keys_revision(current_api_keys)
        if expected_revision != current_revision:
            return ManagedAPIKeysWriteAttempt(
                status="revision_conflict",
                api_keys=current_api_keys,
                revision=current_revision,
                error_code=MANAGED_API_KEYS_REVISION_CONFLICT_ERROR_CODE,
                error=(
                    ".env API key store revision mismatch: "
                    f"expected {expected_revision}, found {current_revision}."
                ),
            )
        try:
            next_dot_env_payload = _build_next_dot_env_payload(
                raw_payload=raw_dot_env_payload,
                current_managed_key_names=current_managed_key_names,
                managed_key_names_to_purge=managed_key_names_to_purge,
                next_managed_api_keys=normalized,
            )
            _write_dot_env_payload_to_disk(path, next_dot_env_payload)
        except ManagedAPIKeysStoreUnavailableError as exc:
            return _store_unavailable_result(exc)
        removed_keys_from_process_env = set(current_managed_key_names)
        removed_keys_from_process_env.update(managed_key_names_to_purge)
        for removed_key in removed_keys_from_process_env:
            if removed_key in normalized:
                continue
            if removed_key not in current_env_vars:
                continue
            os.environ.pop(removed_key, None)
    dbe.reload_dot_env()
    return ManagedAPIKeysWriteAttempt(
        status="success",
        api_keys=normalized,
        revision=_compute_api_keys_revision(normalized),
    )


def collect_config_api_key_names(config: AllLLMConfigs) -> set[str]:
    keys: set[str] = set()
    for provider in config.configs.values():
        if provider.api_key_env:
            keys.add(provider.api_key_env)
    return keys


def filter_env_vars_for_config(
    env_vars: dict[str, str],
    config: AllLLMConfigs,
) -> APIKeys:
    desired = collect_config_api_key_names(config)
    filtered: APIKeys = {}
    for key in desired:
        value = env_vars.get(key)
        if value is not None:
            filtered[key] = value
    return filtered


def resolve_effective_llm_api_keys(
    *,
    config: AllLLMConfigs,
    managed_api_keys: APIKeys,
) -> APIKeys:
    process_env_vars = dict(os.environ)
    process_api_keys = filter_env_vars_for_config(process_env_vars, config)

    merged: APIKeys = {}
    merged.update(process_api_keys)
    # User-configured keys from .env override process-level defaults.
    merged.update(managed_api_keys)
    return merged


def resolve_runtime_llm_api_keys(
    *,
    config: AllLLMConfigs,
    managed_api_keys: APIKeys,
) -> APIKeys:
    process_env_vars = dict(os.environ)
    process_api_keys = filter_env_vars_for_config(process_env_vars, config)
    managed_configured_api_keys = filter_env_vars_for_config(managed_api_keys, config)

    merged: APIKeys = {}
    merged.update(process_api_keys)
    # Persisted values from .env should override process-level defaults.
    merged.update(managed_configured_api_keys)
    return merged
