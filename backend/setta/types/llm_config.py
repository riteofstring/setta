"""Pydantic serializers for the persisted LLM configuration."""

from pydantic import BaseModel, Field

from setta.llm.constants import DEFAULT_GATEWAY_URL
from setta.llm.models import JSONValue


class LLMModelConfigPayload(BaseModel):
    model_id: str
    display_name: str
    supports_reasoning: bool = False
    default_parameters: JSONValue | None = None


class LLMProviderConfigPayload(BaseModel):
    provider_id: str
    display_name: str
    api_key: str = ""
    base_url: str | None = None
    default_model_id: str | None = None
    extra_headers: dict[str, str] | None = None
    models: list[LLMModelConfigPayload] = Field(default_factory=list)


class LLMConfigPayload(BaseModel):
    gateway_url: str = DEFAULT_GATEWAY_URL
    providers: list[LLMProviderConfigPayload] = Field(default_factory=list)


__all__ = [
    "LLMConfigPayload",
    "LLMModelConfigPayload",
    "LLMProviderConfigPayload",
]
