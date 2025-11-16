"""Static provider and model presets for the Portkey gateway UI."""

from dataclasses import dataclass
from typing import Optional, Sequence

from setta.llm.config_store import LLMModelConfig, LLMProviderConfig
from setta.types.llm_config import (
    LLMModelConfigPayload,
    LLMProviderConfigPayload,
    LLMProviderPresetPayload,
)


@dataclass(frozen=True)
class LLMProviderPreset:
    """Preset provider metadata used to auto-populate the editor UI."""

    preset_id: str
    label: str
    description: str | None
    provider: LLMProviderConfig

    def to_payload(self) -> LLMProviderPresetPayload:
        return LLMProviderPresetPayload(
            preset_id=self.preset_id,
            label=self.label,
            description=self.description,
            provider=_provider_to_payload(self.provider),
        )


def get_llm_provider_presets() -> list[LLMProviderPreset]:
    """Return every available provider preset."""

    return list(_PROVIDER_PRESETS)


def find_provider_preset(provider_id: str) -> Optional[LLMProviderPreset]:
    """Look up a preset by provider slug."""

    for preset in _PROVIDER_PRESETS:
        if preset.provider.provider_id == provider_id:
            return preset
    return None


def _provider_to_payload(provider: LLMProviderConfig) -> LLMProviderConfigPayload:
    return LLMProviderConfigPayload(
        provider_id=provider.provider_id,
        display_name=provider.display_name,
        api_key=provider.api_key,
        base_url=provider.base_url,
        default_model_id=provider.default_model_id,
        extra_headers=provider.extra_headers,
        models=[_model_to_payload(model) for model in provider.models],
    )


def _model_to_payload(model: LLMModelConfig) -> LLMModelConfigPayload:
    return LLMModelConfigPayload(
        model_id=model.model_id,
        display_name=model.display_name,
        supports_reasoning=model.supports_reasoning,
        default_parameters=model.default_parameters,
    )


def _build_provider(
    *,
    provider_id: str,
    display_name: str,
    description: str | None,
    models: Sequence[LLMModelConfig],
    base_url: str | None = None,
    default_model_id: str | None = None,
    extra_headers: dict[str, str] | None = None,
) -> LLMProviderPreset:
    provider_config = LLMProviderConfig(
        provider_id=provider_id,
        display_name=display_name,
        api_key="",
        base_url=base_url,
        default_model_id=default_model_id,
        extra_headers=extra_headers,
        models=list(models),
    )
    return LLMProviderPreset(
        preset_id=provider_id,
        label=display_name,
        description=description,
        provider=provider_config,
    )


_PROVIDER_PRESETS: tuple[LLMProviderPreset, ...] = (
    _build_provider(
        provider_id="openai",
        display_name="OpenAI",
        description="First-party OpenAI API routed through the Portkey gateway.",
        models=(
            LLMModelConfig(
                model_id="gpt-4o-mini",
                display_name="GPT-4o mini",
            ),
            LLMModelConfig(
                model_id="gpt-4o",
                display_name="GPT-4o",
                supports_reasoning=True,
            ),
            LLMModelConfig(
                model_id="gpt-4.1-mini",
                display_name="GPT-4.1 Mini",
                supports_reasoning=True,
            ),
            LLMModelConfig(
                model_id="gpt-4.1",
                display_name="GPT-4.1",
                supports_reasoning=True,
            ),
        ),
        default_model_id="gpt-4o-mini",
    ),
    _build_provider(
        provider_id="anthropic",
        display_name="Anthropic",
        description="Claude 3.x series served via Portkey.",
        models=(
            LLMModelConfig(
                model_id="claude-3-5-sonnet-latest",
                display_name="Claude 3.5 Sonnet",
                supports_reasoning=True,
            ),
            LLMModelConfig(
                model_id="claude-3-opus-latest",
                display_name="Claude 3 Opus",
                supports_reasoning=True,
            ),
            LLMModelConfig(
                model_id="claude-3-haiku-latest",
                display_name="Claude 3 Haiku",
            ),
        ),
        default_model_id="claude-3-5-sonnet-latest",
    ),
)


__all__ = [
    "LLMProviderPreset",
    "find_provider_preset",
    "get_llm_provider_presets",
]
