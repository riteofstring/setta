"""Curated presets for popular LLM models used inside Setta."""

from typing import Any, TypedDict

_OPENAI_API_KEY_ENV = "SETTA_OPENAI_API_KEY"
_ANTHROPIC_API_KEY_ENV = "SETTA_ANTHROPIC_API_KEY"
_GEMINI_API_KEY_ENV = "SETTA_GEMINI_API_KEY"


class LLMPresetBase(TypedDict):
    api_key_env: str


class LLMPreset(LLMPresetBase, total=False):
    provider: str
    base_url: str
    other_params: dict[str, Any]


LLM_MODEL_PRESETS: dict[str, LLMPreset] = {
    # OpenAI GPT family
    "gpt-4o": {
        "provider": "openai",
        "api_key_env": _OPENAI_API_KEY_ENV,
    },
    "gpt-4o-mini": {
        "provider": "openai",
        "api_key_env": _OPENAI_API_KEY_ENV,
    },
    "gpt-4.1": {
        "provider": "openai",
        "api_key_env": _OPENAI_API_KEY_ENV,
    },
    "gpt-4.1-mini": {
        "provider": "openai",
        "api_key_env": _OPENAI_API_KEY_ENV,
    },
    "gpt-4-turbo": {
        "provider": "openai",
        "api_key_env": _OPENAI_API_KEY_ENV,
    },
    "gpt-3.5-turbo": {
        "provider": "openai",
        "api_key_env": _OPENAI_API_KEY_ENV,
    },
    # Anthropic Claude family
    "claude-3-5-sonnet-20240620": {
        "provider": "anthropic",
        "api_key_env": _ANTHROPIC_API_KEY_ENV,
    },
    "claude-3-7-sonnet-20250219": {
        "provider": "anthropic",
        "api_key_env": _ANTHROPIC_API_KEY_ENV,
    },
    "claude-3-opus-20240229": {
        "provider": "anthropic",
        "api_key_env": _ANTHROPIC_API_KEY_ENV,
    },
    "claude-3-sonnet-20240229": {
        "provider": "anthropic",
        "api_key_env": _ANTHROPIC_API_KEY_ENV,
    },
    "claude-3-haiku-20240307": {
        "provider": "anthropic",
        "api_key_env": _ANTHROPIC_API_KEY_ENV,
    },
    # Google Gemini family
    "gemini-1.5-pro-latest": {
        "provider": "google",
        "api_key_env": _GEMINI_API_KEY_ENV,
    },
    "gemini-1.5-flash-latest": {
        "provider": "google",
        "api_key_env": _GEMINI_API_KEY_ENV,
    },
    "gemini-1.5-flash-8b-latest": {
        "provider": "google",
        "api_key_env": _GEMINI_API_KEY_ENV,
    },
}
