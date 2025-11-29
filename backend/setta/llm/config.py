"""Helpers for persisting the LLM configuration file."""

import json
from pathlib import Path
from typing import Any, Iterable

from setta.types.chat import ChatMetadata
from setta.types.llm_config import AllLLMConfigs
from setta.utils.constants import C
from setta.utils.generate_memorable_string import generate_memorable_available_string


def load_llm_config(
    config_path: Path | None = None,
) -> AllLLMConfigs:
    """Load and validate ``setta_files/llm_config.json``."""

    raw = _read_config(config_path)
    if not raw:
        return AllLLMConfigs()
    return AllLLMConfigs.model_validate(raw)


def save_llm_config(
    config: AllLLMConfigs,
    config_path: Path | None = None,
) -> None:
    """Persist the LLM configuration, writing canonical JSON."""
    path = _resolve_path(config_path)
    sanitized = _strip_temporary_configs(config)
    path.write_text(
        sanitized.model_dump_json(indent=2, exclude_unset=True) + "\n",
    )


def _read_config(config_path: Path | None) -> dict[str, Any]:
    path = _resolve_path(config_path)
    if not path.exists():
        return {}
    try:
        raw = json.loads(path.read_text())
    except json.JSONDecodeError:
        return {}
    if not isinstance(raw, dict):
        return {}
    return raw


def _resolve_path(config_path: Path | None) -> Path:
    if config_path:
        path = config_path
    else:
        path = Path(C.SETTA_FILES_FOLDER) / C.LLM_CONFIG_FILENAME
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _strip_temporary_configs(config: AllLLMConfigs) -> AllLLMConfigs:
    persisted: dict[str, Any] = {}
    for config_id, entry in config.configs.items():
        if entry.temporary:
            continue
        persisted[config_id] = entry
    default_config_id = config.default_config_id
    if default_config_id and default_config_id not in persisted:
        default_config_id = None
    return AllLLMConfigs(configs=persisted, default_config_id=default_config_id)


def merge_chat_llm_configs(
    config: AllLLMConfigs,
    chat_metadata: Iterable[ChatMetadata],
) -> AllLLMConfigs:
    configs = dict(config.configs)
    for chat in chat_metadata:
        currConfig = chat.llmConfig
        currConfigId = currConfig.id
        if not currConfigId or currConfigId in configs:
            currConfigId = generate_memorable_available_string(configs.keys())
        configs[currConfigId] = currConfig.model_copy(
            update={"id": currConfigId, "temporary": True}
        )
    return AllLLMConfigs(
        configs=configs,
        default_config_id=config.default_config_id,
    )
