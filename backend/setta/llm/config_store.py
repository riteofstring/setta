"""Persistence helpers for the self-hosted Portkey gateway configuration."""

import json
from copy import deepcopy
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any

from setta.llm.constants import CONFIG_PATH, DEFAULT_GATEWAY_URL
from setta.llm.models import JSONValue
from setta.types.llm_config import (
    LLMConfigPayload,
    LLMModelConfigPayload,
    LLMProjectConfigPayload,
    LLMProviderConfigPayload,
)

if TYPE_CHECKING:
    from setta.llm.presets import LLMProviderPreset
    from setta.types.chat_messages import LLMModelSelection


@dataclass
class LLMModelConfig:
    """Model metadata and default parameters for the local gateway."""

    model_id: str
    display_name: str
    supports_reasoning: bool = False
    default_parameters: dict[str, JSONValue] | None = None
    preset_id: str | None = None


@dataclass
class LLMProviderConfig:
    """Provider-level configuration, including secrets and routing options."""

    provider_id: str
    display_name: str
    preset_id: str | None = None
    api_key: str = ""
    base_url: str | None = None
    default_model_id: str | None = None
    extra_headers: dict[str, str] | None = None
    models: list[LLMModelConfig] = field(default_factory=list)


@dataclass
class LLMProjectConfig:
    """Collection of providers scoped to a single project configuration."""

    project_config_id: str
    providers: list[LLMProviderConfig] = field(default_factory=list)


@dataclass
class LLMConfig:
    """Top-level configuration for running the Portkey gateway."""

    gateway_url: str = DEFAULT_GATEWAY_URL
    providers: list[LLMProviderConfig] = field(default_factory=list)
    default_project_config_id: str | None = None
    project_configs: dict[str, LLMProjectConfig] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        payload = _llm_config_to_override_payload(self)
        return payload.model_dump(mode="python", exclude_none=True)

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "LLMConfig":
        payload_model = LLMConfigPayload.model_validate(payload)
        return _hydrate_llm_config(payload_model)

    def providers_for_project(
        self,
        project_config_id: str | None,
    ) -> list[LLMProviderConfig]:
        if project_config_id is not None:
            project = self.project_configs.get(project_config_id)
            if project is None:
                raise ValueError(f"Unknown project config: {project_config_id}")
            return project.providers
        if self.default_project_config_id:
            project = self.project_configs.get(self.default_project_config_id)
            if project:
                return project.providers
        return self.providers

    def iter_all_providers(self) -> list[LLMProviderConfig]:
        providers: list[LLMProviderConfig] = list(self.providers)
        for project in self.project_configs.values():
            providers.extend(project.providers)
        return providers


def _ensure_directory(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def load_llm_config(config_path: Path | None = None) -> LLMConfig:
    """Read the persisted gateway configuration, returning defaults if missing."""

    path = config_path or CONFIG_PATH
    if not path.exists():
        return LLMConfig()
    payload = json.loads(path.read_text(encoding="utf-8"))
    return LLMConfig.from_dict(payload)


def save_llm_config(config: LLMConfig, config_path: Path | None = None) -> None:
    """Persist the gateway configuration to the canonical JSON file."""

    path = config_path or CONFIG_PATH
    _ensure_directory(path)
    serialized = json.dumps(config.to_dict(), indent=2, sort_keys=False)
    path.write_text(f"{serialized}\n", encoding="utf-8")


def config_to_payload(config: LLMConfig) -> LLMConfigPayload:
    """Convert the dataclass configuration into the Pydantic payload used by APIs."""

    return _llm_config_to_full_payload(config)


def payload_to_config(payload: LLMConfigPayload) -> LLMConfig:
    """Convert an API payload back into the runtime dataclass."""

    payload_model = (
        payload
        if isinstance(payload, LLMConfigPayload)
        else LLMConfigPayload.model_validate(payload)
    )
    return _hydrate_llm_config(payload_model)


def add_preset_to_config(
    config: LLMConfig,
    *,
    preset_id: str,
    provider_id: str | None = None,
    overrides: LLMProviderConfigPayload | None = None,
    project_config_id: str | None = None,
) -> LLMProviderConfig:
    """Rebuild or append a provider entry using the latest preset metadata."""

    preset = _lookup_preset_provider(preset_id, strict=True)
    if not preset:
        raise ValueError(f"Unknown LLM provider preset: {preset_id}")

    provider_list = _resolve_provider_collection(config, project_config_id)
    base_payload = preset.to_payload().provider.model_copy(
        update={"preset_id": preset.preset_id}
    )

    existing_index = _find_provider_index(
        provider_list,
        provider_id
        or (overrides.provider_id if overrides else None)
        or base_payload.provider_id,
    )
    existing_provider = (
        provider_list[existing_index] if existing_index is not None else None
    )
    existing_overrides = (
        _serialize_provider_overrides(existing_provider) if existing_provider else None
    )

    merged_payload = _merge_provider_payload_overrides(
        base_payload,
        [
            existing_overrides,
            overrides,
        ],
    )
    merged_payload.provider_id = (
        provider_id
        or merged_payload.provider_id
        or base_payload.provider_id
        or preset.preset_id
    )

    provider = _hydrate_provider(merged_payload, preset=preset)
    if existing_index is None:
        provider_list.append(provider)
    else:
        provider_list[existing_index] = provider
    return provider


def resolve_model_selection(
    config: LLMConfig,
    selection: "LLMModelSelection",
    *,
    project_config_id: str | None = None,
) -> tuple[LLMProviderConfig, LLMModelConfig]:
    """Locate the provider/model pair for a selection or fail loudly."""

    providers = config.providers_for_project(project_config_id)
    provider = _get_provider(providers, selection.providerId, project_config_id)
    model = _get_model(provider, selection.modelId)
    return provider, model


def _get_provider(
    providers: list[LLMProviderConfig],
    provider_id: str,
    project_config_id: str | None,
) -> LLMProviderConfig:
    for provider in providers:
        if provider.provider_id == provider_id:
            return provider
    scope = project_config_id or "<default>"
    raise ValueError(f"Unknown LLM provider '{provider_id}' for project {scope}")


def _get_model(provider: LLMProviderConfig, model_id: str) -> LLMModelConfig:
    for model in provider.models:
        if model.model_id == model_id:
            return model
    raise ValueError(
        f"Unknown model '{model_id}' for provider '{provider.provider_id}'"
    )


def validate_llm_request(
    provider: LLMProviderConfig,
    model: LLMModelConfig | None,
    *,
    deep_think: bool,
) -> dict[str, object] | None:
    """Validate credentials and model capabilities for a request."""

    if not provider.api_key and not _has_authorization_header(provider.extra_headers):
        raise ValueError(f"Provider '{provider.display_name}' is missing credentials.")
    return build_llm_request_params(model=model, deep_think=deep_think)


def build_llm_request_params(
    *,
    model: LLMModelConfig | None,
    deep_think: bool,
) -> dict[str, object] | None:
    """Materialize the model parameters for a request, validating reasoning support."""

    if model is None:
        if deep_think:
            raise ValueError("Deep Thinking requires a model selection.")
        return None

    params = _clone_model_default_parameters(model)

    if deep_think:
        if not model.supports_reasoning:
            raise ValueError(
                f"Model '{model.display_name}' does not support Deep Thinking."
            )
        reasoning_payload = _extract_reasoning_payload(params)
        reasoning_payload.setdefault("effort", "medium")
        params["reasoning"] = reasoning_payload

    return params or None


def _llm_config_to_full_payload(config: LLMConfig) -> LLMConfigPayload:
    return LLMConfigPayload(
        gateway_url=config.gateway_url,
        providers=[
            _provider_config_to_payload(provider) for provider in config.providers
        ],
        default_project_config_id=config.default_project_config_id,
        project_configs={
            project_id: LLMProjectConfigPayload(
                providers=[
                    _provider_config_to_payload(provider)
                    for provider in project.providers
                ]
            )
            for project_id, project in config.project_configs.items()
        },
    )


def _llm_config_to_override_payload(config: LLMConfig) -> LLMConfigPayload:
    return LLMConfigPayload(
        gateway_url=config.gateway_url,
        providers=[
            _serialize_provider_overrides(provider) for provider in config.providers
        ],
        default_project_config_id=config.default_project_config_id,
        project_configs={
            project_id: LLMProjectConfigPayload(
                providers=[
                    _serialize_provider_overrides(provider)
                    for provider in project.providers
                ]
            )
            for project_id, project in config.project_configs.items()
        },
    )


def _hydrate_llm_config(payload: LLMConfigPayload) -> LLMConfig:
    providers = _hydrate_provider_list(payload.providers)
    project_configs = {
        project_id: LLMProjectConfig(
            project_config_id=project_id,
            providers=_hydrate_provider_list(project_payload.providers),
        )
        for project_id, project_payload in payload.project_configs.items()
    }
    return LLMConfig(
        gateway_url=payload.gateway_url,
        providers=providers,
        default_project_config_id=payload.default_project_config_id,
        project_configs=project_configs,
    )


def _hydrate_provider_list(
    payloads: list[LLMProviderConfigPayload],
) -> list[LLMProviderConfig]:
    hydrated: list[LLMProviderConfig] = []
    seen_ids: set[str] = set()

    for provider_payload in payloads:
        preset_lookup_id = provider_payload.preset_id or provider_payload.provider_id
        preset = _lookup_preset_provider(
            preset_lookup_id,
            strict=bool(provider_payload.preset_id),
        )
        provider = _hydrate_provider(provider_payload, preset=preset)
        if provider.provider_id in seen_ids:
            raise ValueError(
                f"Duplicate LLM provider_id '{provider.provider_id}' in config"
            )
        seen_ids.add(provider.provider_id)
        hydrated.append(provider)

    return hydrated


def _hydrate_provider(
    payload: LLMProviderConfigPayload,
    *,
    preset: "LLMProviderPreset | None",
) -> LLMProviderConfig:
    base_provider = preset.provider if preset else None

    provider_id = (
        payload.provider_id
        if payload.provider_id is not None
        else (base_provider.provider_id if base_provider else None)
    )
    if provider_id is None:
        raise ValueError("Provider config missing provider_id")

    display_name = (
        payload.display_name
        if payload.display_name is not None
        else (base_provider.display_name if base_provider else provider_id)
    )
    api_key = (
        payload.api_key
        if payload.api_key is not None
        else (base_provider.api_key if base_provider else "")
    )
    base_url = (
        payload.base_url
        if payload.base_url is not None
        else (base_provider.base_url if base_provider else None)
    )
    default_model_id = (
        payload.default_model_id
        if payload.default_model_id is not None
        else (base_provider.default_model_id if base_provider else None)
    )
    extra_headers = (
        _clone_headers(payload.extra_headers)
        if payload.extra_headers is not None
        else _clone_headers(base_provider.extra_headers if base_provider else None)
    )

    models = _hydrate_models(
        base_models=base_provider.models if base_provider else None,
        overrides=payload.models,
        provider_id=provider_id,
    )
    resolved_default_model_id = _resolve_default_model_id(
        default_model_id,
        models,
        provider_id=provider_id,
    )

    return LLMProviderConfig(
        provider_id=provider_id,
        display_name=display_name,
        preset_id=preset.preset_id if preset else payload.preset_id,
        api_key=api_key or "",
        base_url=base_url,
        default_model_id=resolved_default_model_id,
        extra_headers=extra_headers,
        models=models,
    )


def _hydrate_models(
    *,
    base_models: list[LLMModelConfig] | None,
    overrides: list[LLMModelConfigPayload] | None,
    provider_id: str,
) -> list[LLMModelConfig]:
    base_models = base_models or []
    models: list[LLMModelConfig] = [_clone_model(model) for model in base_models]

    index_by_key: dict[str, int] = {}
    seen_ids: set[str] = set()
    for idx, model in enumerate(models):
        seen_ids.add(model.model_id)
        index_by_key[model.model_id] = idx
        if model.preset_id:
            index_by_key.setdefault(model.preset_id, idx)

    if overrides:
        for override in overrides:
            base_index = None
            if override.preset_id:
                base_index = index_by_key.get(override.preset_id)
                if base_index is None and base_models:
                    raise ValueError(
                        f"Unknown model preset '{override.preset_id}' "
                        f"for provider '{provider_id}'"
                    )
            elif override.model_id:
                base_index = index_by_key.get(override.model_id)

            base_model = models[base_index] if base_index is not None else None
            hydrated = _hydrate_model(override, base_model=base_model)

            if hydrated.preset_id is None and base_model:
                hydrated.preset_id = base_model.preset_id or base_model.model_id

            if base_index is None:
                if hydrated.model_id in seen_ids:
                    raise ValueError(
                        f"Duplicate model id '{hydrated.model_id}' "
                        f"for provider '{provider_id}'"
                    )
                models.append(hydrated)
                base_index = len(models) - 1
            else:
                previous_id = models[base_index].model_id
                if hydrated.model_id != previous_id and hydrated.model_id in seen_ids:
                    raise ValueError(
                        f"Duplicate model id '{hydrated.model_id}' "
                        f"for provider '{provider_id}'"
                    )
                seen_ids.discard(previous_id)
                models[base_index] = hydrated

            seen_ids.add(hydrated.model_id)
            index_by_key[hydrated.model_id] = base_index
            if hydrated.preset_id:
                index_by_key[hydrated.preset_id] = base_index

    return models


def _hydrate_model(
    payload: LLMModelConfigPayload,
    *,
    base_model: LLMModelConfig | None,
) -> LLMModelConfig:
    preset_id = payload.preset_id or (base_model.preset_id if base_model else None)
    model_id = payload.model_id or (base_model.model_id if base_model else None)
    if not model_id:
        raise ValueError("Model config missing model_id")

    display_name = (
        payload.display_name
        if payload.display_name is not None
        else (base_model.display_name if base_model else model_id)
    )
    supports_reasoning = (
        payload.supports_reasoning
        if payload.supports_reasoning is not None
        else (base_model.supports_reasoning if base_model else False)
    )
    default_parameters = (
        _clone_json(payload.default_parameters)
        if payload.default_parameters is not None
        else _clone_json(base_model.default_parameters if base_model else None)
    )

    return LLMModelConfig(
        model_id=model_id,
        display_name=display_name,
        supports_reasoning=supports_reasoning,
        default_parameters=default_parameters,
        preset_id=preset_id,
    )


def _resolve_default_model_id(
    default_model_id: str | None,
    models: list[LLMModelConfig],
    *,
    provider_id: str,
) -> str | None:
    if default_model_id is None:
        return None if not models else models[0].model_id

    for model in models:
        if model.model_id == default_model_id:
            return default_model_id
    raise ValueError(
        f"Default model_id '{default_model_id}' not found for provider '{provider_id}'"
    )


def _serialize_provider_overrides(
    provider: LLMProviderConfig | None,
) -> LLMProviderConfigPayload:
    if provider is None:
        return LLMProviderConfigPayload()

    preset = _lookup_preset_provider(provider.preset_id or provider.provider_id)
    base_provider = preset.provider if preset else None

    data: dict[str, Any] = {}
    if provider.preset_id:
        data["preset_id"] = provider.preset_id

    if base_provider is None or provider.provider_id != base_provider.provider_id:
        data["provider_id"] = provider.provider_id
    if base_provider is None or provider.display_name != base_provider.display_name:
        data["display_name"] = provider.display_name
    if base_provider is None or provider.api_key != base_provider.api_key:
        data["api_key"] = provider.api_key
    if base_provider is None or provider.base_url != base_provider.base_url:
        data["base_url"] = provider.base_url
    if (
        base_provider is None
        or provider.default_model_id != base_provider.default_model_id
    ):
        data["default_model_id"] = provider.default_model_id
    if base_provider is None or provider.extra_headers != base_provider.extra_headers:
        data["extra_headers"] = _clone_headers(provider.extra_headers)

    model_overrides = _serialize_model_overrides(
        provider.models,
        base_provider.models if base_provider else None,
    )
    if model_overrides is not None:
        data["models"] = model_overrides

    if "preset_id" not in data and preset:
        data["preset_id"] = preset.preset_id

    return LLMProviderConfigPayload(**data)


def _serialize_model_overrides(
    models: list[LLMModelConfig],
    base_models: list[LLMModelConfig] | None,
) -> list[LLMModelConfigPayload] | None:
    base_models = base_models or []
    base_by_key: dict[str, LLMModelConfig] = {
        model.model_id: model for model in base_models
    }
    for model in base_models:
        if model.preset_id:
            base_by_key.setdefault(model.preset_id, model)

    overrides: list[LLMModelConfigPayload] = []
    for model in models:
        base_model = base_by_key.get(model.preset_id or model.model_id)
        payload = _model_overrides(model, base_model)
        if payload is not None:
            overrides.append(payload)

    if base_models and not overrides:
        return None
    return overrides


def _model_overrides(
    model: LLMModelConfig,
    base_model: LLMModelConfig | None,
) -> LLMModelConfigPayload | None:
    data: dict[str, Any] = {}
    if model.preset_id:
        data["preset_id"] = model.preset_id
    if (
        base_model is None
        or model.model_id != base_model.model_id
        or model.preset_id is None
    ):
        data["model_id"] = model.model_id
    if base_model is None or model.display_name != base_model.display_name:
        data["display_name"] = model.display_name
    if base_model is None or model.supports_reasoning != base_model.supports_reasoning:
        data["supports_reasoning"] = model.supports_reasoning
    if base_model is None or model.default_parameters != base_model.default_parameters:
        data["default_parameters"] = _clone_json(model.default_parameters)

    if base_model is not None and data.keys() == {"preset_id"}:
        return None
    return LLMModelConfigPayload(**data)


def _lookup_preset_provider(
    preset_id: str | None,
    *,
    strict: bool = False,
) -> "LLMProviderPreset | None":
    if not preset_id:
        return None
    from setta.llm.presets import find_provider_preset

    preset = find_provider_preset(preset_id)
    if preset is None:
        if strict:
            raise ValueError(f"Unknown LLM provider preset: {preset_id}")
        return None
    return preset


def _merge_provider_payload_overrides(
    base_payload: LLMProviderConfigPayload,
    overlays: list[LLMProviderConfigPayload | None],
) -> LLMProviderConfigPayload:
    merged_data = base_payload.model_dump(mode="python", exclude_unset=False)
    merged_models = merged_data.get("models")

    for overlay in overlays:
        if overlay is None:
            continue
        overlay_data = overlay.model_dump(mode="python", exclude_unset=True)
        if "models" in overlay_data and overlay_data["models"] is not None:
            merged_models = _merge_model_payloads(
                merged_models,
                overlay_data["models"],
            )
        for key, value in overlay_data.items():
            if key in {"models", "preset_id"}:
                continue
            merged_data[key] = value

    if merged_models is not None:
        merged_data["models"] = merged_models

    return LLMProviderConfigPayload.model_validate(merged_data)


def _merge_model_payloads(
    base_models: list[dict[str, Any]] | None,
    overrides: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = [deepcopy(model) for model in base_models or []]
    index_by_key: dict[str, int] = {}
    for idx, model in enumerate(merged):
        key = _model_payload_key(model)
        if key:
            index_by_key.setdefault(key, idx)

    for override in overrides:
        key = _model_payload_key(override)
        if key and key in index_by_key:
            merged[index_by_key[key]].update(override)
            continue
        merged.append(deepcopy(override))
        if key:
            index_by_key[key] = len(merged) - 1

    return merged


def _model_payload_key(payload: dict[str, Any]) -> str | None:
    preset_id = payload.get("preset_id")
    if isinstance(preset_id, str) and preset_id:
        return preset_id
    model_id = payload.get("model_id")
    if isinstance(model_id, str) and model_id:
        return model_id
    return None


def _provider_config_to_payload(
    provider: LLMProviderConfig,
) -> LLMProviderConfigPayload:
    return LLMProviderConfigPayload(
        provider_id=provider.provider_id,
        display_name=provider.display_name,
        preset_id=provider.preset_id,
        api_key=provider.api_key,
        base_url=provider.base_url,
        default_model_id=provider.default_model_id,
        extra_headers=provider.extra_headers,
        models=[_model_config_to_payload(model) for model in provider.models],
    )


def _model_config_to_payload(model: LLMModelConfig) -> LLMModelConfigPayload:
    return LLMModelConfigPayload(
        model_id=model.model_id,
        display_name=model.display_name,
        supports_reasoning=model.supports_reasoning,
        default_parameters=model.default_parameters,
        preset_id=model.preset_id,
    )


def _resolve_provider_collection(
    config: LLMConfig,
    project_config_id: str | None,
) -> list[LLMProviderConfig]:
    if project_config_id is None:
        return config.providers

    project = config.project_configs.get(project_config_id)
    if project is None:
        raise ValueError(f"Unknown project config: {project_config_id}")
    return project.providers


def _find_provider_index(
    providers: list[LLMProviderConfig],
    provider_id: str,
) -> int | None:
    for index, provider in enumerate(providers):
        if provider.provider_id == provider_id:
            return index
    return None


def _has_authorization_header(headers: dict[str, str] | None) -> bool:
    if not headers:
        return False
    return any(
        key.lower() == "authorization" and bool(value) for key, value in headers.items()
    )


def _clone_model_default_parameters(model: LLMModelConfig) -> dict[str, object]:
    payload = model.default_parameters
    if payload is None:
        return {}
    if not isinstance(payload, dict):
        raise TypeError(
            f"Model '{model.display_name}' default_parameters must be a JSON object."
        )
    return json.loads(json.dumps(payload))


def _extract_reasoning_payload(params: dict[str, object]) -> dict[str, object]:
    reasoning = params.get("reasoning")
    if reasoning is None:
        return {}
    if not isinstance(reasoning, dict):
        raise TypeError("Reasoning defaults must be provided as a JSON object.")
    return dict(reasoning)


def _clone_headers(headers: dict[str, str] | None) -> dict[str, str] | None:
    if headers is None:
        return None
    return dict(headers)


def _clone_json(
    payload: dict[str, JSONValue] | None,
) -> dict[str, JSONValue] | None:
    if payload is None:
        return None
    return deepcopy(payload)


def _clone_model(model: LLMModelConfig) -> LLMModelConfig:
    return LLMModelConfig(
        model_id=model.model_id,
        display_name=model.display_name,
        supports_reasoning=model.supports_reasoning,
        default_parameters=_clone_json(model.default_parameters),
        preset_id=model.preset_id or model.model_id,
    )
