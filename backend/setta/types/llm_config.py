"""Pydantic serializers for the persisted LLM configuration."""

from pydantic import BaseModel, Field

from setta.llm.constants import DEFAULT_GATEWAY_URL
from setta.llm.models import JSONValue


class LLMModelConfigPayload(BaseModel):
    model_id: str
    display_name: str
    supports_reasoning: bool = False
    default_parameters: JSONValue | None = None
    preset_id: str | None = None


class LLMProviderConfigPayload(BaseModel):
    provider_id: str
    display_name: str
    preset_id: str | None = None
    api_key: str = ""
    base_url: str | None = None
    default_model_id: str | None = None
    extra_headers: dict[str, str] | None = None
    models: list[LLMModelConfigPayload] = Field(default_factory=list)


class LLMProjectConfigPayload(BaseModel):
    providers: list[LLMProviderConfigPayload] = Field(default_factory=list)


class LLMConfigPayload(BaseModel):
    gateway_url: str = DEFAULT_GATEWAY_URL
    providers: list[LLMProviderConfigPayload] = Field(default_factory=list)
    default_project_config_id: str | None = None
    project_configs: dict[str, LLMProjectConfigPayload] = Field(default_factory=dict)


class LLMProviderPresetPayload(BaseModel):
    preset_id: str
    label: str
    description: str | None = None
    provider: LLMProviderConfigPayload


class LLMPresetCatalogPayload(BaseModel):
    providers: list[LLMProviderPresetPayload] = Field(default_factory=list)


class LLMGatewayTestResultPayload(BaseModel):
    ok: bool
    url: str | None = None
    error: str | None = None


class LLMProviderTestErrorPayload(BaseModel):
    message: str
    code: str | None = None


class LLMProviderTestResultPayload(BaseModel):
    provider_id: str
    display_name: str
    base_url: str | None = None
    ok: bool = False
    errors: list[LLMProviderTestErrorPayload] = Field(default_factory=list)


class LLMConfigTestResultPayload(BaseModel):
    gateway: LLMGatewayTestResultPayload
    providers: list[LLMProviderTestResultPayload] = Field(default_factory=list)


__all__ = [
    "LLMConfigPayload",
    "LLMModelConfigPayload",
    "LLMProjectConfigPayload",
    "LLMProviderConfigPayload",
    "LLMPresetCatalogPayload",
    "LLMProviderPresetPayload",
    "LLMGatewayTestResultPayload",
    "LLMProviderTestResultPayload",
    "LLMProviderTestErrorPayload",
    "LLMConfigTestResultPayload",
]
