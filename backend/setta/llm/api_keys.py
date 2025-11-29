"""Shared helpers for reading and filtering LLM API keys."""

from pathlib import Path

from dotenv import dotenv_values, load_dotenv

from setta.types.ai import APIKeys
from setta.types.llm_config import AllLLMConfigs
from setta.utils.constants import CWD


def resolve_env_path(filepath: str | Path | None) -> Path:
    raw = Path(filepath or ".env")
    if not raw.is_absolute():
        raw = (CWD / raw).resolve()
    return raw


def read_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    env_vars = dotenv_values(str(path))
    return {key: value for key, value in env_vars.items() if value is not None}


def write_env_file(path: Path, env_vars: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [f"{key}={value}" for key, value in env_vars.items()]
    content = "\n".join(lines)
    if content:
        content += "\n"
    path.write_text(content)


def reload_process_env(path: Path) -> None:
    load_dotenv(dotenv_path=path, override=True)


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
