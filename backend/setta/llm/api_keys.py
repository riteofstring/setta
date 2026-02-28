"""Shared helpers for persisting and filtering LLM API keys."""

import json
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from setta.database.db_objs import DBE
from setta.types.chat import APIKeys
from setta.types.llm_config import AllLLMConfigs
from setta.types.managed_api_keys import ManagedAPIKeysSnapshot

LLM_API_KEYS_FILENAME = "llm_api_keys.json"
MANAGED_API_KEYS_CORRUPT_ERROR_CODE = "managed_api_keys_store_corrupt"
MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE = "managed_api_keys_store_unavailable"
MANAGED_API_KEYS_REVISION_CONFLICT_ERROR_CODE = "managed_api_keys_revision_conflict"
_MANAGED_API_KEYS_STORE_FIELDS = {"revision", "apiKeys"}


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
    """Managed API key storage is currently unreadable due to I/O failure."""


class ManagedAPIKeysStoreCorruptError(RuntimeError):
    """Managed API key storage contains an unreadable payload."""


def llm_api_keys_path(dbe: DBE) -> Path:
    return dbe.runtime_root / "secrets" / LLM_API_KEYS_FILENAME


def _normalize_api_key_name(raw_key: str) -> str:
    return raw_key.strip()


def _normalize_api_key_value(raw_value: str) -> str:
    value = raw_value.strip()
    if value == "":
        raise ValueError("Managed API key values must be non-empty strings.")
    return value


def _normalize_managed_api_keys_payload(payload: object) -> APIKeys:
    if not isinstance(payload, dict):
        raise ValueError("Managed API key store must contain an object.")
    normalized: APIKeys = {}
    for raw_key, raw_value in payload.items():
        if not isinstance(raw_key, str):
            raise ValueError("Managed API key names must be strings.")
        if not isinstance(raw_value, str):
            raise ValueError("Managed API key values must be strings.")
        key = _normalize_api_key_name(raw_key)
        if not key:
            continue
        normalized[key] = _normalize_api_key_value(raw_value)
    return normalized


def _normalize_managed_api_key_store_payload(payload: object) -> tuple[int, APIKeys]:
    if not isinstance(payload, dict):
        raise ValueError("Managed API key store must contain an object.")
    unknown_fields = sorted(set(payload.keys()) - _MANAGED_API_KEYS_STORE_FIELDS)
    if unknown_fields:
        raise ValueError(
            "Managed API key store contains unsupported fields: "
            + ", ".join(str(field) for field in unknown_fields)
        )
    if "revision" not in payload:
        raise ValueError("Managed API key store must contain 'revision'.")
    if "apiKeys" not in payload:
        raise ValueError("Managed API key store must contain 'apiKeys'.")
    revision_raw = payload["revision"]
    if isinstance(revision_raw, bool) or not isinstance(revision_raw, int):
        raise ValueError(
            "Managed API key store revision must be a non-negative integer."
        )
    if revision_raw < 0:
        raise ValueError(
            "Managed API key store revision must be a non-negative integer."
        )
    normalized_api_keys = _normalize_managed_api_keys_payload(payload["apiKeys"])
    return revision_raw, normalized_api_keys


def _normalize_api_key_write_payload(payload: APIKeys) -> APIKeys:
    normalized: APIKeys = {}
    for raw_key, raw_value in payload.items():
        key = _normalize_api_key_name(raw_key)
        if not key:
            continue
        value = raw_value.strip()
        if value == "":
            continue
        normalized[key] = value
    return normalized


def build_managed_api_keys_snapshot(
    result: ManagedAPIKeysReadResult,
) -> ManagedAPIKeysSnapshot:
    return ManagedAPIKeysSnapshot(
        apiKeys=result.api_keys,
        revision=result.revision,
        corrupt=result.corrupt,
        errorCode=result.error_code,
        message=result.error,
    )


def _parse_managed_api_keys_raw_payload(
    raw_payload: str | None,
) -> ManagedAPIKeysReadResult:
    if raw_payload is None:
        return ManagedAPIKeysReadResult(api_keys={}, revision=0, corrupt=False)
    if not raw_payload.strip():
        return ManagedAPIKeysReadResult(
            api_keys={},
            revision=0,
            corrupt=True,
            error_code=MANAGED_API_KEYS_CORRUPT_ERROR_CODE,
            error="Managed API key store is not valid JSON: empty payload",
        )
    try:
        payload = json.loads(raw_payload)
    except (TypeError, ValueError) as exc:
        return ManagedAPIKeysReadResult(
            api_keys={},
            revision=0,
            corrupt=True,
            error_code=MANAGED_API_KEYS_CORRUPT_ERROR_CODE,
            error=f"Managed API key store is not valid JSON: {exc}",
        )
    try:
        revision, normalized = _normalize_managed_api_key_store_payload(payload)
    except ValueError as exc:
        return ManagedAPIKeysReadResult(
            api_keys={},
            revision=0,
            corrupt=True,
            error_code=MANAGED_API_KEYS_CORRUPT_ERROR_CODE,
            error=str(exc),
        )
    return ManagedAPIKeysReadResult(
        api_keys=normalized, revision=revision, corrupt=False
    )


def _write_managed_api_keys_store_payload(
    path: Path,
    *,
    revision: int,
    api_keys: APIKeys,
) -> None:
    payload = {"revision": revision, "apiKeys": api_keys}
    serialized_payload = json.dumps(payload, indent=2, sort_keys=True)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            mode="w",
            dir=path.parent,
            delete=False,
            suffix=".tmp",
            encoding="utf-8",
        ) as tmp_file:
            tmp_file.write(serialized_payload)
            tmp_path = Path(tmp_file.name)
        tmp_path.replace(path)
    except OSError as exc:
        raise ManagedAPIKeysStoreUnavailableError(
            f"Failed to write managed API key store: {exc}"
        ) from exc


def _read_managed_api_keys_raw_payload_from_disk(path: Path) -> str | None:
    if not path.exists():
        return None
    try:
        return path.read_text(encoding="utf-8")
    except (UnicodeError, ValueError) as exc:
        raise ManagedAPIKeysStoreCorruptError(
            f"Managed API key store is not valid UTF-8: {exc}"
        ) from exc
    except OSError as exc:
        raise ManagedAPIKeysStoreUnavailableError(
            f"Failed to read managed API key store: {exc}"
        ) from exc


def _read_managed_api_keys_raw_payload(dbe: DBE) -> str | None:
    path = llm_api_keys_path(dbe)
    with dbe.get_file_lock(path):
        return _read_managed_api_keys_raw_payload_from_disk(path)


def read_managed_api_keys_with_status(dbe: DBE) -> ManagedAPIKeysReadResult:
    try:
        raw_payload = _read_managed_api_keys_raw_payload(dbe)
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
    return _parse_managed_api_keys_raw_payload(raw_payload)


def read_managed_api_keys(dbe: DBE) -> APIKeys:
    result = read_managed_api_keys_with_status(dbe)
    if result.error_code == MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE:
        if result.error is None:
            raise ValueError("Managed API key store is unavailable.")
        raise ValueError(result.error)
    if result.corrupt:
        if result.error is None:
            raise ValueError("Managed API key store is corrupt.")
        raise ValueError(result.error)
    return result.api_keys


def write_managed_api_keys_with_expected_revision(
    dbe: DBE,
    payload: APIKeys,
    *,
    expected_revision: int,
) -> ManagedAPIKeysWriteAttempt:
    def _store_unavailable_result(error: Exception) -> ManagedAPIKeysWriteAttempt:
        return ManagedAPIKeysWriteAttempt(
            status="store_unavailable",
            api_keys={},
            revision=0,
            error_code=MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE,
            error=str(error),
        )

    normalized = _normalize_api_key_write_payload(payload)
    path = llm_api_keys_path(dbe)
    with dbe.get_file_lock(path):
        try:
            raw_payload = _read_managed_api_keys_raw_payload_from_disk(path)
        except ManagedAPIKeysStoreUnavailableError as exc:
            return _store_unavailable_result(exc)
        except ManagedAPIKeysStoreCorruptError as exc:
            if expected_revision == 0:
                try:
                    _write_managed_api_keys_store_payload(
                        path,
                        revision=1,
                        api_keys=normalized,
                    )
                except (ManagedAPIKeysStoreUnavailableError, OSError) as write_exc:
                    return _store_unavailable_result(write_exc)
                return ManagedAPIKeysWriteAttempt(
                    status="success",
                    api_keys=normalized,
                    revision=1,
                )
            return ManagedAPIKeysWriteAttempt(
                status="corrupt_store",
                api_keys={},
                revision=0,
                error_code=MANAGED_API_KEYS_CORRUPT_ERROR_CODE,
                error=str(exc),
            )
        read_result = _parse_managed_api_keys_raw_payload(raw_payload)
        if read_result.corrupt:
            if expected_revision != 0:
                return ManagedAPIKeysWriteAttempt(
                    status="corrupt_store",
                    api_keys={},
                    revision=0,
                    error_code=MANAGED_API_KEYS_CORRUPT_ERROR_CODE,
                    error=read_result.error,
                )
            try:
                _write_managed_api_keys_store_payload(
                    path,
                    revision=1,
                    api_keys=normalized,
                )
            except (ManagedAPIKeysStoreUnavailableError, OSError) as write_exc:
                return _store_unavailable_result(write_exc)
            return ManagedAPIKeysWriteAttempt(
                status="success",
                api_keys=normalized,
                revision=1,
            )
        if expected_revision != read_result.revision:
            return ManagedAPIKeysWriteAttempt(
                status="revision_conflict",
                api_keys=read_result.api_keys,
                revision=read_result.revision,
                error_code=MANAGED_API_KEYS_REVISION_CONFLICT_ERROR_CODE,
                error=(
                    "Managed API key store revision mismatch: "
                    f"expected {expected_revision}, found {read_result.revision}."
                ),
            )
        next_revision = read_result.revision + 1
        try:
            _write_managed_api_keys_store_payload(
                path,
                revision=next_revision,
                api_keys=normalized,
            )
        except (ManagedAPIKeysStoreUnavailableError, OSError) as write_exc:
            return _store_unavailable_result(write_exc)
        return ManagedAPIKeysWriteAttempt(
            status="success",
            api_keys=normalized,
            revision=next_revision,
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
