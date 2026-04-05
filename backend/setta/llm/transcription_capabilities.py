from setta.types.llm_config import LLMConfig

_OPENAI_REALTIME_TRANSCRIPTION_MODEL_IDS = {
    "gpt-4o-transcribe",
    "gpt-4o-mini-transcribe",
}
_OPENAI_REALTIME_TRANSCRIPTION_MODEL_PREFIXES = (
    "gpt-4o-realtime",
    "gpt-realtime",
)


def supports_realtime_transcription(llm_config: LLMConfig) -> bool:
    provider = (llm_config.provider or "").strip().lower()
    if provider == "openai":
        pass
    elif provider:
        return False
    elif llm_config.base_url is not None:
        return False

    model = llm_config.model.strip().lower()
    if not model:
        return False
    if model in _OPENAI_REALTIME_TRANSCRIPTION_MODEL_IDS:
        return True
    return model.startswith(_OPENAI_REALTIME_TRANSCRIPTION_MODEL_PREFIXES)
