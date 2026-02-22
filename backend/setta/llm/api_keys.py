"""Shared helpers for reading and filtering LLM API keys."""

from setta.types.chat import APIKeys
from setta.types.llm_config import AllLLMConfigs


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
