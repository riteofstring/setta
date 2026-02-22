from dataclasses import dataclass
from typing import Any

import litellm

from setta.types.agentic import AgentRun

_USAGE_NUMERIC_KEYS: tuple[str, ...] = (
    "promptTokens",
    "completionTokens",
    "totalTokens",
    "inputTokens",
    "outputTokens",
    "cachedInputTokens",
    "reasoningOutputTokens",
    "contextWindowTokens",
)
_USAGE_SNAKE_TO_CAMEL: dict[str, str] = {
    "prompt_tokens": "promptTokens",
    "completion_tokens": "completionTokens",
    "total_tokens": "totalTokens",
    "input_tokens": "inputTokens",
    "output_tokens": "outputTokens",
    "cached_input_tokens": "cachedInputTokens",
    "reasoning_output_tokens": "reasoningOutputTokens",
    "model_context_window": "contextWindowTokens",
}


@dataclass(frozen=True)
class ResolvedChatContextUsage:
    context_window_tokens: int | None
    context_used_tokens: int | None
    estimated: bool


def _normalize_optional_string(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    if not normalized:
        return None
    return normalized


def _extract_non_negative_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value >= 0 else None
    if isinstance(value, float):
        parsed = int(value)
        return parsed if parsed >= 0 else None
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            parsed = int(stripped)
        except ValueError:
            return None
        return parsed if parsed >= 0 else None
    return None


def _normalize_usage_payload(payload: Any) -> dict[str, int] | None:
    if not isinstance(payload, dict):
        return None
    normalized: dict[str, int] = {}
    for key in _USAGE_NUMERIC_KEYS:
        parsed = _extract_non_negative_int(payload.get(key))
        if parsed is not None:
            normalized[key] = parsed
    for source_key, target_key in _USAGE_SNAKE_TO_CAMEL.items():
        if target_key in normalized:
            continue
        parsed = _extract_non_negative_int(payload.get(source_key))
        if parsed is not None:
            normalized[target_key] = parsed
    if "promptTokens" not in normalized and "inputTokens" in normalized:
        normalized["promptTokens"] = normalized["inputTokens"]
    if "completionTokens" not in normalized and "outputTokens" in normalized:
        normalized["completionTokens"] = normalized["outputTokens"]
    if "totalTokens" not in normalized:
        prompt_tokens = normalized.get("promptTokens")
        completion_tokens = normalized.get("completionTokens")
        if prompt_tokens is not None and completion_tokens is not None:
            normalized["totalTokens"] = prompt_tokens + completion_tokens
    return normalized or None


def extract_run_usage_payload(run: AgentRun) -> dict[str, int] | None:
    outputs = run.outputs if isinstance(run.outputs, dict) else None
    if outputs is None:
        return None
    return _normalize_usage_payload(outputs.get("usage"))


def _resolve_model_info_context_window_tokens(model_id: str) -> int | None:
    try:
        model_info = litellm.get_model_info(model_id)
    except Exception:
        model_info = None
    if isinstance(model_info, dict):
        for key in ("max_input_tokens", "max_tokens", "max_context_tokens"):
            parsed = _extract_non_negative_int(model_info.get(key))
            if parsed is None:
                continue
            if parsed <= 0:
                continue
            return parsed
    try:
        fallback_tokens = litellm.get_max_tokens(model_id)
    except Exception:
        fallback_tokens = None
    parsed_fallback = _extract_non_negative_int(fallback_tokens)
    if parsed_fallback is None:
        return None
    if parsed_fallback <= 0:
        return None
    return parsed_fallback


def resolve_model_context_window_tokens(
    model: str | None,
    provider: str | None = None,
) -> int | None:
    normalized_model = _normalize_optional_string(model)
    if normalized_model is None:
        return None
    candidates = [normalized_model]
    normalized_provider = _normalize_optional_string(provider)
    if normalized_provider is not None and "/" not in normalized_model:
        candidates.insert(0, f"{normalized_provider}/{normalized_model}")
    for candidate in candidates:
        resolved = _resolve_model_info_context_window_tokens(candidate)
        if resolved is not None:
            return resolved
    return None


def _resolve_context_window_tokens(
    usage_payload: dict[str, int] | None,
    *,
    model: str | None,
    provider: str | None = None,
) -> int | None:
    if usage_payload is not None:
        context_window_tokens = usage_payload.get("contextWindowTokens")
        if context_window_tokens is not None and context_window_tokens > 0:
            return context_window_tokens
    return resolve_model_context_window_tokens(model, provider)


def _resolve_context_used_tokens(usage_payload: dict[str, int] | None) -> int | None:
    if usage_payload is None:
        return None
    prompt_tokens = usage_payload.get("promptTokens")
    if prompt_tokens is not None:
        return prompt_tokens
    return usage_payload.get("inputTokens")


def resolve_internal_run_context_usage(
    run: AgentRun,
    *,
    model: str | None,
    provider: str | None = None,
) -> ResolvedChatContextUsage | None:
    usage_payload = extract_run_usage_payload(run)
    context_window_tokens = _resolve_context_window_tokens(
        usage_payload,
        model=model,
        provider=provider,
    )
    context_used_tokens = _resolve_context_used_tokens(usage_payload)
    if context_window_tokens is None and context_used_tokens is None:
        return None
    return ResolvedChatContextUsage(
        context_window_tokens=context_window_tokens,
        context_used_tokens=context_used_tokens,
        estimated=False,
    )


def resolve_external_run_context_usage(
    run: AgentRun,
    *,
    model: str | None,
) -> ResolvedChatContextUsage | None:
    usage_payload = extract_run_usage_payload(run)
    context_window_tokens = _resolve_context_window_tokens(
        usage_payload,
        model=model,
    )
    context_used_tokens = _resolve_context_used_tokens(usage_payload)
    if context_window_tokens is None and context_used_tokens is None:
        return None
    return ResolvedChatContextUsage(
        context_window_tokens=context_window_tokens,
        context_used_tokens=context_used_tokens,
        estimated=False,
    )
