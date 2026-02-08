import json
from typing import Any


def _extract_json_from_bytes_repr(raw: str) -> dict[str, Any] | None:
    """
    LiteLLM provider errors sometimes embed a bytes repr like:
      ... - b'{"type":"error","error":{"message":"..."}...}'
    Try to extract + parse that JSON payload.
    """

    start = raw.find("b'{")
    if start == -1:
        return None

    json_start = start + 2  # after "b'"
    end_quote = raw.find("'", json_start)
    if end_quote == -1:
        return None

    candidate = raw[json_start:end_quote]
    try:
        payload = json.loads(candidate)
    except json.JSONDecodeError:
        return None
    if isinstance(payload, dict):
        return payload
    return None


def get_user_facing_llm_error_message(exc: BaseException) -> str | None:
    """
    Return a user-facing error message for LLM provider failures, if we can extract one.

    If we can't confidently extract a useful message, return None to avoid surfacing
    noisy/internal error strings to the UI.
    """

    raw = str(exc).strip()
    if not raw:
        return None

    payload = _extract_json_from_bytes_repr(raw)
    if payload is not None:
        error = payload.get("error")
        if isinstance(error, dict):
            message = error.get("message")
            if isinstance(message, str) and message.strip():
                return message.strip()
        message = payload.get("message")
        if isinstance(message, str) and message.strip():
            return message.strip()

    lowered = raw.lower()
    if "credit balance" in lowered and "too low" in lowered:
        return "Your LLM provider credit balance is too low. Please purchase credits and retry."
    if "insufficient_quota" in lowered or ("quota" in lowered and "exceed" in lowered):
        return "Your LLM provider quota has been exceeded. Please check billing/limits and retry."
    if "invalid api key" in lowered or ("authentication" in lowered and "fail" in lowered):
        return "Your LLM API key appears invalid. Update it in Settings and retry."
    if "rate limit" in lowered or "too many requests" in lowered:
        return "The LLM provider rate-limited this request. Please wait and retry."

    return None
