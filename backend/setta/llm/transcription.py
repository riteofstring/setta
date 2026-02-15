from typing import Any

import litellm

from setta.types.llm_config import AllLLMConfigs, LLMConfig


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
    request_payload, api_key_env = config.build_llm_params(llm_config)
    request_payload = dict(request_payload)
    request_payload["file"] = (file_name, audio_bytes, mime_type)
    if language:
        request_payload["language"] = language
    if api_key_env:
        api_key = api_keys.get(api_key_env)
        if not api_key:
            raise KeyError(
                f"Missing API key for '{api_key_env}'. Configure it in LLM API Keys."
            )
        request_payload["api_key"] = api_key
    response = await litellm.atranscription(**request_payload)
    return _extract_transcribed_text(response)
