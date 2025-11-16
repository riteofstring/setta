"""Persistence helpers for the self-hosted Portkey gateway configuration."""

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from setta.llm.models import JSONValue
from setta.utils.constants import C

CONFIG_FILENAME = "llm_config.json"
DEFAULT_GATEWAY_URL = "http://127.0.0.1:8787"
CONFIG_PATH = C.SETTA_FILES_FOLDER / CONFIG_FILENAME


@dataclass
class LLMModelConfig:
    """Model metadata and default parameters for the local gateway."""

    model_id: str
    display_name: str
    supports_reasoning: bool = False
    default_parameters: dict[str, JSONValue] | None = None

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "model_id": self.model_id,
            "display_name": self.display_name,
            "supports_reasoning": self.supports_reasoning,
        }
        if self.default_parameters is not None:
            data["default_parameters"] = self.default_parameters
        return data

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "LLMModelConfig":
        return cls(
            model_id=payload["model_id"],
            display_name=payload["display_name"],
            supports_reasoning=payload.get("supports_reasoning", False),
            default_parameters=payload.get("default_parameters"),
        )


@dataclass
class LLMProviderConfig:
    """Provider-level configuration, including secrets and routing options."""

    provider_id: str
    display_name: str
    api_key: str = ""
    base_url: str | None = None
    default_model_id: str | None = None
    extra_headers: dict[str, str] | None = None
    models: list[LLMModelConfig] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "provider_id": self.provider_id,
            "display_name": self.display_name,
            "api_key": self.api_key,
            "models": [model.to_dict() for model in self.models],
        }
        if self.base_url is not None:
            data["base_url"] = self.base_url
        if self.default_model_id is not None:
            data["default_model_id"] = self.default_model_id
        if self.extra_headers is not None:
            data["extra_headers"] = self.extra_headers
        return data

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "LLMProviderConfig":
        models_payload = payload.get("models", [])
        return cls(
            provider_id=payload["provider_id"],
            display_name=payload["display_name"],
            api_key=payload.get("api_key", ""),
            base_url=payload.get("base_url"),
            default_model_id=payload.get("default_model_id"),
            extra_headers=payload.get("extra_headers"),
            models=[LLMModelConfig.from_dict(item) for item in models_payload],
        )


@dataclass
class LLMConfig:
    """Top-level configuration for running the Portkey gateway."""

    gateway_url: str = DEFAULT_GATEWAY_URL
    providers: list[LLMProviderConfig] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "gateway_url": self.gateway_url,
            "providers": [provider.to_dict() for provider in self.providers],
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "LLMConfig":
        providers_payload = payload.get("providers", [])
        return cls(
            gateway_url=payload.get("gateway_url", DEFAULT_GATEWAY_URL),
            providers=[
                LLMProviderConfig.from_dict(provider)
                for provider in providers_payload
            ],
        )


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
