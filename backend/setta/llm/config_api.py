"""Thin facade around LLM config storage with scoped request helpers."""

from dataclasses import dataclass
from typing import TYPE_CHECKING

from setta.llm.config_store import (
    LLMConfig,
    LLMModelConfig,
    LLMProviderConfig,
    add_preset_to_config,
    config_to_payload,
    infer_provider_headers,
    load_llm_config,
    payload_to_config,
    resolve_model_selection,
    save_llm_config,
    validate_llm_request,
)

if TYPE_CHECKING:
    from setta.types.chat_messages import LLMModelSelection
    from setta.types.llm_config import LLMConfigPayload, LLMProviderConfigPayload


@dataclass
class ResolvedLLMSelection:
    provider: LLMProviderConfig
    model: LLMModelConfig
    project_config_id: str | None


@dataclass
class LLMRequestContext(ResolvedLLMSelection):
    request_params: dict[str, object] | None
    extra_headers: dict[str, str] | None


def load_config(config_path=None) -> LLMConfig:
    return load_llm_config(config_path=config_path)


def save_config(config: LLMConfig, config_path=None) -> None:
    save_llm_config(config, config_path=config_path)


def config_payload(config: LLMConfig):
    return config_to_payload(config)


def payload_to_config_model(payload: "LLMConfigPayload") -> LLMConfig:
    return payload_to_config(payload)


def add_preset(
    config: LLMConfig,
    *,
    preset_id: str,
    provider_id: str | None = None,
    overrides: "LLMProviderConfigPayload | None" = None,
    project_config_id: str | None = None,
) -> LLMProviderConfig:
    return add_preset_to_config(
        config,
        preset_id=preset_id,
        provider_id=provider_id,
        overrides=overrides,
        project_config_id=project_config_id,
    )


def resolve_selection(
    config: LLMConfig,
    selection: "LLMModelSelection",
    *,
    project_config_id: str | None,
) -> ResolvedLLMSelection:
    scoped_project_id = _resolve_project_scope(config, project_config_id)
    provider, model = resolve_model_selection(
        config,
        selection,
        project_config_id=scoped_project_id,
    )
    return ResolvedLLMSelection(
        provider=provider,
        model=model,
        project_config_id=scoped_project_id,
    )


def validate_request(
    resolved_provider: LLMProviderConfig,
    resolved_model: LLMModelConfig,
    *,
    deep_think: bool,
) -> dict[str, object] | None:
    return validate_llm_request(
        resolved_provider,
        resolved_model,
        deep_think=deep_think,
    )


def build_request_context(
    config: LLMConfig,
    selection: "LLMModelSelection",
    *,
    project_config_id: str | None,
    deep_think: bool,
) -> LLMRequestContext:
    resolved = resolve_selection(
        config,
        selection,
        project_config_id=project_config_id,
    )
    request_params = validate_request(
        resolved.provider,
        resolved.model,
        deep_think=deep_think,
    )
    return LLMRequestContext(
        provider=resolved.provider,
        model=resolved.model,
        project_config_id=resolved.project_config_id,
        request_params=request_params,
        extra_headers=infer_provider_headers(resolved.provider),
    )


def _resolve_project_scope(
    config: LLMConfig,
    project_config_id: str | None,
) -> str | None:
    if project_config_id is not None:
        return project_config_id
    return config.default_project_config_id
