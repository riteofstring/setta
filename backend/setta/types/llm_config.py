from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class LLMConfig(BaseModel):
    """Configuration for a single provider/model combination."""

    id: str
    model: str
    provider: str | None = None
    base_url: str | None = None
    api_key_env: str | None = None
    other_params: dict[str, Any] | None = None
    temporary: bool = False

    model_config = ConfigDict(extra="forbid")


class AllLLMConfigs(BaseModel):
    """Top-level structure persisted in ``setta_files/llm_config.json``."""

    configs: dict[str, LLMConfig] = Field(default_factory=dict)
    default_config_id: str | None = None

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="before")
    @classmethod
    def _derive_config_ids(cls, payload: Any) -> Any:
        if not isinstance(payload, dict):
            return payload
        raw_configs = payload.get("configs")
        if not isinstance(raw_configs, dict):
            return payload
        normalized_payload = dict(payload)
        normalized_payload["configs"] = {
            config_id: cls._normalize_config_entry(config_id, config)
            for config_id, config in raw_configs.items()
        }
        return normalized_payload

    @staticmethod
    def _normalize_config_entry(config_id: str, entry: Any) -> Any:
        if not isinstance(entry, dict):
            return entry
        if "id" in entry:
            raise ValueError(
                f"LLM config '{config_id}' cannot declare an id; use the key instead"
            )
        return {**entry, "id": config_id}

    @model_validator(mode="after")
    def _validate_configs(self) -> "AllLLMConfigs":
        normalized: dict[str, LLMConfig] = {}
        for config_id, config in self.configs.items():
            if config.id and config.id != config_id:
                raise ValueError(
                    f"LLM config '{config_id}' declared mismatched id '{config.id}'"
                )
            normalized[config_id] = config.model_copy(update={"id": config_id})
        self.configs = normalized
        if self.default_config_id and self.default_config_id not in normalized:
            self.default_config_id = None
        return self

    def resolve_config(
        self,
        llm_config_id: str,
    ) -> LLMConfig:
        if not llm_config_id:
            raise ValueError("LLM config requires a provider id")
        config = self.configs.get(llm_config_id)
        if not config:
            raise ValueError(f"LLM config missing provider '{llm_config_id}'")
        return config

    def build_llm_params(
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
