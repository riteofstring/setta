from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class LLMProviderConfig(BaseModel):
    """Configuration for a single provider/model combination."""

    provider: str
    model: str
    base_url: str | None = None
    api_key_env: str | None = None
    other_params: dict[str, Any] | None = None

    model_config = ConfigDict(extra="forbid")


class LiteLLMConfig(BaseModel):
    """Top-level structure persisted in ``setta_files/llm_config.json``."""

    providers: dict[str, LLMProviderConfig] = Field(default_factory=dict)
    default_provider_id: str | None = None

    model_config = ConfigDict(extra="forbid")

    def resolve_provider(
        self,
        provider_id: str | None = None,
    ) -> tuple[str, LLMProviderConfig]:
        target_id = provider_id or self.default_provider_id
        if not target_id:
            raise ValueError("liteLLM config requires at least one provider")
        provider = self.providers.get(target_id)
        if not provider:
            raise ValueError(f"liteLLM config missing provider '{target_id}'")
        return target_id, provider

    def build_litellm_params(
        self,
        provider_id: str | None = None,
    ) -> tuple[dict[str, Any], str | None]:
        _, provider = self.resolve_provider(provider_id)
        payload: dict[str, Any] = {
            "model": provider.model,
            "custom_llm_provider": provider.provider,
        }
        if provider.base_url:
            payload["api_base"] = provider.base_url
        if provider.other_params:
            payload.update(provider.other_params)
        return payload, provider.api_key_env
