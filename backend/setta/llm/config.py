"""Helpers for persisting the LLM configuration file."""

from typing import Any, Iterable

from setta.database.db_objs import DBE
from setta.types.chat import ChatMetadata
from setta.types.llm_config import AllLLMConfigs
from setta.utils.generate_memorable_string import generate_memorable_available_string


def load_llm_config(dbe: DBE) -> AllLLMConfigs:
    raw = dbe.read_llm_config()
    if not raw:
        config = AllLLMConfigs()
        dbe.write_llm_config(config.model_dump(exclude_unset=True))
        return config
    return AllLLMConfigs.model_validate(raw)


def save_llm_config(
    config: AllLLMConfigs,
    dbe: DBE,
) -> None:
    """Persist the LLM configuration, writing canonical JSON."""
    sanitized = _strip_temporary_configs(config)
    payload = sanitized.model_dump(exclude_unset=True)
    dbe.write_llm_config(payload)


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
