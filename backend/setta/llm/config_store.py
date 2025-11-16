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


_MISSING = object()


@dataclass
class LLMModelConfig:
    """Model metadata and default parameters for the local gateway."""

    model_id: str
    display_name: str
    supports_reasoning: bool = False
    default_parameters: dict[str, JSONValue] | None = None
    preset_id: str | None = None

    def to_dict(self, *, base_model: "LLMModelConfig | None" = None) -> dict[str, Any]:
        """Serialize the config, optionally diffing against a preset model."""

        data: dict[str, Any] = {}
        if self.preset_id is not None:
            data["preset_id"] = self.preset_id
        _maybe_set(
            data,
            "model_id",
            self.model_id,
            base_value=base_model.model_id if base_model else _MISSING,
        )
        _maybe_set(
            data,
            "display_name",
            self.display_name,
            base_value=base_model.display_name if base_model else _MISSING,
        )
        _maybe_set(
            data,
            "supports_reasoning",
            self.supports_reasoning,
            base_value=base_model.supports_reasoning if base_model else _MISSING,
        )
        _maybe_set(
            data,
            "default_parameters",
            self.default_parameters,
            base_value=base_model.default_parameters if base_model else _MISSING,
            include_none=True,
        )
        return data

    @classmethod
    def from_dict(
        cls,
        payload: dict[str, Any],
        base_model: "LLMModelConfig | None" = None,
    ) -> "LLMModelConfig":
        preset_id = payload.get("preset_id")
        if preset_id is not None and base_model is None:
            raise ValueError(f"Unknown preset model: {preset_id}")

        model_id = _coalesce_value(
            payload,
            "model_id",
            base_model.model_id if base_model else None,
        )
        display_name = _coalesce_value(
            payload,
            "display_name",
            base_model.display_name if base_model else None,
        )
        supports_reasoning = payload.get(
            "supports_reasoning",
            base_model.supports_reasoning if base_model else False,
        )
        if "default_parameters" in payload:
            default_parameters = _clone_json(payload["default_parameters"])
        else:
            default_parameters = _clone_json(
                base_model.default_parameters if base_model else None
            )

        resolved_preset_id = (
            preset_id
            if preset_id is not None
            else (base_model.preset_id if base_model and base_model.preset_id else None)
        )

        return cls(
            model_id=model_id,
            display_name=display_name,
            supports_reasoning=supports_reasoning,
            default_parameters=default_parameters,
            preset_id=resolved_preset_id,
        )


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

    def to_dict(self) -> dict[str, Any]:
        base_provider = _lookup_preset_provider(self.preset_id)
        base_config = base_provider.provider if base_provider else None

        data: dict[str, Any] = {}
        if self.preset_id is not None:
            data["preset_id"] = self.preset_id

        _maybe_set(
            data,
            "provider_id",
            self.provider_id,
            base_value=base_config.provider_id if base_config else _MISSING,
        )
        _maybe_set(
            data,
            "display_name",
            self.display_name,
            base_value=base_config.display_name if base_config else _MISSING,
        )
        _maybe_set(
            data,
            "api_key",
            self.api_key,
            base_value=base_config.api_key if base_config else _MISSING,
        )
        _maybe_set(
            data,
            "base_url",
            self.base_url,
            base_value=base_config.base_url if base_config else _MISSING,
            include_none=True,
        )
        _maybe_set(
            data,
            "default_model_id",
            self.default_model_id,
            base_value=base_config.default_model_id if base_config else _MISSING,
            include_none=True,
        )
        _maybe_set(
            data,
            "extra_headers",
            self.extra_headers,
            base_value=base_config.extra_headers if base_config else _MISSING,
            include_none=True,
        )

        models_payload = self._serialize_models(
            base_models=base_config.models if base_config else None
        )
        if models_payload is not None:
            data["models"] = models_payload

        return data

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "LLMProviderConfig":
        preset_id = payload.get("preset_id")
        preset = _lookup_preset_provider(preset_id, strict=bool(preset_id))
        base_provider = preset.provider if preset else None

        provider_id = _coalesce_value(
            payload,
            "provider_id",
            base_provider.provider_id if base_provider else None,
        )
        display_name = _coalesce_value(
            payload,
            "display_name",
            base_provider.display_name if base_provider else provider_id,
        )
        if "api_key" in payload:
            api_key = payload["api_key"] or ""
        else:
            api_key = base_provider.api_key if base_provider else ""
        base_url = (
            payload["base_url"]
            if "base_url" in payload
            else (base_provider.base_url if base_provider else None)
        )
        default_model_id = (
            payload["default_model_id"]
            if "default_model_id" in payload
            else (base_provider.default_model_id if base_provider else None)
        )
        extra_headers = _clone_headers(
            payload.get(
                "extra_headers",
                base_provider.extra_headers if base_provider else None,
            )
        )

        models_payload = payload.get("models")
        models = _hydrate_models(
            base_models=base_provider.models if base_provider else None,
            overrides=models_payload,
        )

        return cls(
            provider_id=provider_id,
            display_name=display_name,
            preset_id=preset.preset_id if preset else None,
            api_key=api_key,
            base_url=base_url,
            default_model_id=default_model_id,
            extra_headers=extra_headers,
            models=models,
        )

    def _serialize_models(
        self,
        *,
        base_models: list[LLMModelConfig] | None,
    ) -> list[dict[str, Any]] | None:
        if not self.models and not base_models:
            return []

        serialized: list[dict[str, Any]] = []
        base_models_by_id = (
            {model.model_id: model for model in base_models} if base_models else {}
        )

        for model in self.models:
            base_model = None
            if base_models:
                if model.preset_id and model.preset_id in base_models_by_id:
                    base_model = base_models_by_id[model.preset_id]
                elif model.model_id in base_models_by_id:
                    base_model = base_models_by_id[model.model_id]

            entry = model.to_dict(base_model=base_model)
            if base_model and _is_preset_reference(entry):
                continue
            serialized.append(entry)

        if serialized:
            return serialized
        if base_models:
            return None
        return []


@dataclass
class LLMProjectConfig:
    """Collection of providers scoped to a single project configuration."""

    project_config_id: str
    providers: list[LLMProviderConfig] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "providers": [provider.to_dict() for provider in self.providers],
        }

    @classmethod
    def from_payload(
        cls,
        project_config_id: str,
        payload: LLMProjectConfigPayload,
    ) -> "LLMProjectConfig":
        return cls(
            project_config_id=project_config_id,
            providers=[
                LLMProviderConfig(
                    provider_id=provider.provider_id,
                    display_name=provider.display_name,
                    preset_id=provider.preset_id,
                    api_key=provider.api_key,
                    base_url=provider.base_url,
                    default_model_id=provider.default_model_id,
                    extra_headers=provider.extra_headers,
                    models=[
                        LLMModelConfig(
                            model_id=model.model_id,
                            display_name=model.display_name,
                            supports_reasoning=model.supports_reasoning,
                            default_parameters=model.default_parameters,
                            preset_id=model.preset_id,
                        )
                        for model in provider.models
                    ],
                )
                for provider in payload.providers
            ],
        )

    @classmethod
    def from_dict(
        cls,
        project_config_id: str,
        payload: dict[str, Any],
    ) -> "LLMProjectConfig":
        providers_payload = payload.get("providers", [])
        if not isinstance(providers_payload, list):
            raise TypeError("Project providers payload must be a list")
        return cls(
            project_config_id=project_config_id,
            providers=[
                LLMProviderConfig.from_dict(provider) for provider in providers_payload
            ],
        )


@dataclass
class LLMConfig:
    """Top-level configuration for running the Portkey gateway."""

    gateway_url: str = DEFAULT_GATEWAY_URL
    providers: list[LLMProviderConfig] = field(default_factory=list)
    default_project_config_id: str | None = None
    project_configs: dict[str, LLMProjectConfig] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "gateway_url": self.gateway_url,
            "providers": [provider.to_dict() for provider in self.providers],
            "default_project_config_id": self.default_project_config_id,
            "project_configs": {
                project_id: project.to_dict()
                for project_id, project in self.project_configs.items()
            },
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "LLMConfig":
        providers_payload = payload.get("providers", [])
        project_configs_payload = payload.get("project_configs") or {}
        if not isinstance(project_configs_payload, dict):
            raise TypeError("project_configs payload must be an object")

        project_configs = {
            project_id: LLMProjectConfig.from_dict(project_id, project_payload)
            for project_id, project_payload in project_configs_payload.items()
        }

        return cls(
            gateway_url=payload.get("gateway_url", DEFAULT_GATEWAY_URL),
            providers=[
                LLMProviderConfig.from_dict(provider) for provider in providers_payload
            ],
            default_project_config_id=payload.get("default_project_config_id"),
            project_configs=project_configs,
        )

    def providers_for_project(
        self,
        project_config_id: str | None,
    ) -> list[LLMProviderConfig]:
        if project_config_id:
            project = self.project_configs.get(project_config_id)
            if project:
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

    return LLMConfigPayload(
        gateway_url=config.gateway_url,
        providers=[
            LLMProviderConfigPayload(
                provider_id=provider.provider_id,
                display_name=provider.display_name,
                preset_id=provider.preset_id,
                api_key=provider.api_key,
                base_url=provider.base_url,
                default_model_id=provider.default_model_id,
                extra_headers=provider.extra_headers,
                models=[
                    LLMModelConfigPayload(
                        model_id=model.model_id,
                        display_name=model.display_name,
                        supports_reasoning=model.supports_reasoning,
                        default_parameters=model.default_parameters,
                        preset_id=model.preset_id,
                    )
                    for model in provider.models
                ],
            )
            for provider in config.providers
        ],
        default_project_config_id=config.default_project_config_id,
        project_configs={
            project_id: LLMProjectConfigPayload(
                providers=[
                    LLMProviderConfigPayload(
                        provider_id=provider.provider_id,
                        display_name=provider.display_name,
                        preset_id=provider.preset_id,
                        api_key=provider.api_key,
                        base_url=provider.base_url,
                        default_model_id=provider.default_model_id,
                        extra_headers=provider.extra_headers,
                        models=[
                            LLMModelConfigPayload(
                                model_id=model.model_id,
                                display_name=model.display_name,
                                supports_reasoning=model.supports_reasoning,
                                default_parameters=model.default_parameters,
                                preset_id=model.preset_id,
                            )
                            for model in provider.models
                        ],
                    )
                    for provider in project.providers
                ]
            )
            for project_id, project in config.project_configs.items()
        },
    )


def payload_to_config(payload: LLMConfigPayload) -> LLMConfig:
    """Convert an API payload back into the runtime dataclass."""

    return LLMConfig(
        gateway_url=payload.gateway_url,
        providers=[
            LLMProviderConfig(
                provider_id=provider.provider_id,
                display_name=provider.display_name,
                preset_id=provider.preset_id,
                api_key=provider.api_key,
                base_url=provider.base_url,
                default_model_id=provider.default_model_id,
                extra_headers=provider.extra_headers,
                models=[
                    LLMModelConfig(
                        model_id=model.model_id,
                        display_name=model.display_name,
                        supports_reasoning=model.supports_reasoning,
                        default_parameters=model.default_parameters,
                        preset_id=model.preset_id,
                    )
                    for model in provider.models
                ],
            )
            for provider in payload.providers
        ],
        default_project_config_id=payload.default_project_config_id,
        project_configs={
            project_id: LLMProjectConfig.from_payload(project_id, project)
            for project_id, project in payload.project_configs.items()
        },
    )


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


def _hydrate_models(
    *,
    base_models: list[LLMModelConfig] | None,
    overrides: list[dict[str, Any]] | None,
) -> list[LLMModelConfig]:
    hydrated: list[LLMModelConfig] = []
    model_index: dict[str, int] = {}
    base_models = base_models or []
    overrides = overrides or []

    base_by_id: dict[str, LLMModelConfig] = {}

    for model in base_models:
        base_by_id[model.model_id] = model
        if model.preset_id:
            base_by_id.setdefault(model.preset_id, model)
        clone = LLMModelConfig(
            model_id=model.model_id,
            display_name=model.display_name,
            supports_reasoning=model.supports_reasoning,
            default_parameters=_clone_json(model.default_parameters),
            preset_id=model.preset_id or model.model_id,
        )
        model_index[clone.model_id] = len(hydrated)
        hydrated.append(clone)

    for entry in overrides:
        if not isinstance(entry, dict):
            raise TypeError("Model override payload must be an object.")

        preset_id = entry.get("preset_id")
        base_model = None
        if preset_id:
            base_model = base_by_id.get(preset_id)
            if base_model is None:
                raise ValueError(
                    f"Unknown model preset '{preset_id}' for provider override."
                )
        elif base_by_id:
            entry_id = entry.get("model_id")
            if isinstance(entry_id, str):
                base_model = base_by_id.get(entry_id)

        model = LLMModelConfig.from_dict(entry, base_model=base_model)
        target_model_id: str | None = None

        if base_model is not None and (
            "model_id" not in entry or entry.get("model_id") == base_model.model_id
        ):
            target_model_id = base_model.model_id
        else:
            target_model_id = model.model_id

        index = model_index.get(target_model_id)
        if index is None:
            index = len(hydrated)
            hydrated.append(model)
        else:
            hydrated[index] = model

        if target_model_id != model.model_id:
            model_index.pop(target_model_id, None)
        model_index[model.model_id] = index

    return hydrated


def _coalesce_value(
    payload: dict[str, Any],
    key: str,
    fallback: Any,
) -> Any:
    if key in payload:
        value = payload[key]
        if value is None:
            if fallback is None:
                raise ValueError(f"Missing required config field: {key}")
            return fallback
        return value
    if fallback is None:
        raise ValueError(f"Missing required config field: {key}")
    return fallback


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


def _maybe_set(
    data: dict[str, Any],
    key: str,
    value: Any,
    *,
    base_value: Any = _MISSING,
    include_none: bool = False,
) -> None:
    if base_value is _MISSING:
        if value is None:
            return
        data[key] = value
        return
    if include_none:
        if _value_differs(value, base_value):
            data[key] = value
        return
    if value is None:
        if base_value is not None:
            data[key] = value
        return
    if _value_differs(value, base_value):
        data[key] = value


def _value_differs(current: Any, base_value: Any) -> bool:
    return current != base_value


def _is_preset_reference(entry: dict[str, Any]) -> bool:
    return not any(key != "preset_id" for key in entry)
