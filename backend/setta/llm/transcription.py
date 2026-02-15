from typing import Any

import litellm

from setta.types.llm_config import AllLLMConfigs, LLMConfig

_TRANSCRIPTION_MODEL_KEYS = (
    "transcriptionModel",
    "transcription_model",
    "speechToTextModel",
    "speech_to_text_model",
)

_TRANSCRIPTION_OPTIONS_KEYS = (
    "prompt",
    "response_format",
    "timestamp_granularities",
    "temperature",
    "user",
    "timeout",
    "max_retries",
)


def _build_transcription_request_payload(request: dict[str, Any]) -> dict[str, Any]:
    output: dict[str, Any] = {}
    for key, value in request.items():
        if key in _TRANSCRIPTION_MODEL_KEYS:
            continue
        if key == "transcription":
            continue
        if key.startswith("transcription_"):
            continue
        output[key] = value
    return output


def _resolve_transcription_model(llm_config: LLMConfig) -> str:
    other_params = llm_config.other_params
    if not isinstance(other_params, dict):
        return llm_config.model
    for key in _TRANSCRIPTION_MODEL_KEYS:
        value = other_params.get(key)
        if isinstance(value, str):
            normalized = value.strip()
            if normalized:
                return normalized
    return llm_config.model


def _resolve_transcription_options(llm_config: LLMConfig) -> dict[str, Any]:
    other_params = llm_config.other_params
    if not isinstance(other_params, dict):
        return {}
    direct = other_params.get("transcription")
    if isinstance(direct, dict):
        return dict(direct)
    output: dict[str, Any] = {}
    for key in _TRANSCRIPTION_OPTIONS_KEYS:
        prefixed_key = f"transcription_{key}"
        if prefixed_key in other_params:
            output[key] = other_params[prefixed_key]
    return output


def _extract_transcribed_text(response: Any) -> str:
    raw_text = getattr(response, "text", None)
    if isinstance(raw_text, str) and raw_text.strip():
        return raw_text.strip()
    if isinstance(response, dict):
        text = response.get("text")
        if isinstance(text, str) and text.strip():
            return text.strip()
    raise ValueError("Transcription response did not include text.")


async def transcribe_audio_with_llm(
    *,
    config: AllLLMConfigs,
    llm_config: LLMConfig,
    api_keys: dict[str, str],
    audio_bytes: bytes,
    mime_type: str,
    file_name: str,
    language: str | None,
) -> str:
    request, api_key_env = config.build_llm_params(llm_config)
    model = _resolve_transcription_model(llm_config)
    options = _resolve_transcription_options(llm_config)
    if language:
        options["language"] = language
    request_payload = _build_transcription_request_payload(dict(request))
    request_payload["model"] = model
    request_payload["file"] = (file_name, audio_bytes, mime_type)
    if api_key_env:
        api_key = api_keys.get(api_key_env)
        if not api_key:
            raise KeyError(
                f"Missing API key for '{api_key_env}'. Configure it in LLM API Keys."
            )
        request_payload["api_key"] = api_key
    request_payload.update(options)

    response = await litellm.atranscription(**request_payload)
    return _extract_transcribed_text(response)
