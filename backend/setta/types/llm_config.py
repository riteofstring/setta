from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class LLMConfig(BaseModel):
    """Configuration for a single provider/model combination."""

    model: str
    provider: str | None = None
    base_url: str | None = None
    api_key_env: str | None = None
    other_params: dict[str, Any] | None = None

    model_config = ConfigDict(extra="forbid")


class AllLLMConfigs(BaseModel):
    """Top-level structure persisted in ``setta_files/llm_config.json``."""

    configs: dict[str, LLMConfig] = Field(default_factory=dict)
    default_config_id: str | None = None

    model_config = ConfigDict(extra="forbid")

    def resolve_config(
        self,
        llm_config_id: str,
    ) -> LLMConfig:
        if not llm_config_id:
            raise ValueError("liteLLM config requires a provider id")
        config = self.configs.get(llm_config_id)
        if not config:
            raise ValueError(f"liteLLM config missing provider '{llm_config_id}'")
        return config

    def build_litellm_params(
        self,
        llm_config: LLMConfig,
    ) -> tuple[dict[str, Any], str | None]:
        payload: dict[str, Any] = {"model": llm_config.model}
        if llm_config.provider:
            payload["custom_llm_provider"] = llm_config.provider
        if llm_config.base_url:
            payload["api_base"] = llm_config.base_url
        if llm_config.other_params:
            payload.update(llm_config.other_params)
        return payload, llm_config.api_key_env
