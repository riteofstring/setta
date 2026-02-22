"""Shared helpers for persisting and filtering LLM API keys."""

from dataclasses import dataclass
from pathlib import Path

from setta.database.db_objs import DBE
from setta.types.chat import APIKeys
from setta.types.llm_config import AllLLMConfigs

LLM_API_KEYS_FILENAME = "llm_api_keys.json"


@dataclass(frozen=True)
class ManagedAPIKeysReadResult:
    api_keys: APIKeys
    corrupt: bool
    error: str | None = None


def llm_api_keys_path(dbe: DBE) -> Path:
    return dbe.runtime_root / "secrets" / LLM_API_KEYS_FILENAME


def _normalize_managed_api_keys_payload(payload: object) -> APIKeys:
    if not isinstance(payload, dict):
        raise ValueError("Managed API key store must contain an object.")
    normalized: APIKeys = {}
    for raw_key, raw_value in payload.items():
        if not isinstance(raw_key, str):
            raise ValueError("Managed API key names must be strings.")
        if not isinstance(raw_value, str):
            raise ValueError("Managed API key values must be strings.")
        key = raw_key.strip()
        if not key:
            continue
        normalized[key] = raw_value
    return normalized


def read_managed_api_keys_with_status(dbe: DBE) -> ManagedAPIKeysReadResult:
    payload = dbe.read_json(llm_api_keys_path(dbe))
    if payload is None:
        return ManagedAPIKeysReadResult(api_keys={}, corrupt=False)
    try:
        normalized = _normalize_managed_api_keys_payload(payload)
    except ValueError as exc:
        return ManagedAPIKeysReadResult(
            api_keys={},
            corrupt=True,
            error=str(exc),
        )
    return ManagedAPIKeysReadResult(api_keys=normalized, corrupt=False)


def read_managed_api_keys(dbe: DBE) -> APIKeys:
    result = read_managed_api_keys_with_status(dbe)
    if result.corrupt:
        if result.error is None:
            raise ValueError("Managed API key store is corrupt.")
        raise ValueError(result.error)
    return result.api_keys


def write_managed_api_keys(dbe: DBE, payload: APIKeys) -> APIKeys:
    normalized: APIKeys = {}
    for raw_key, raw_value in payload.items():
        key = raw_key.strip()
        if not key:
            continue
        value = raw_value.strip()
        if not value:
            continue
        normalized[key] = value
    dbe.write_json(llm_api_keys_path(dbe), normalized)
    return normalized


def apply_api_key_updates(
    existing_keys: APIKeys,
    updates: APIKeys,
) -> APIKeys:
    next_keys = dict(existing_keys)
    for raw_key, raw_value in updates.items():
        key = raw_key.strip()
        if not key:
            continue
        value = raw_value.strip()
        if value == "":
            if key in next_keys:
                next_keys.pop(key)
            continue
        next_keys[key] = value
    return next_keys


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
