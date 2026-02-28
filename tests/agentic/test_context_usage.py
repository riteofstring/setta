from setta.agentic.context_usage import (
    resolve_external_run_context_usage,
    resolve_internal_run_context_usage,
)
from setta.types.agentic import AgentRun


def _build_run_with_usage(usage: dict[str, object]) -> AgentRun:
    return AgentRun(
        outputs={
            "usage": usage,
            "metadata": {"model": "gpt-5-runtime", "provider": "openai"},
        }
    )


def test_internal_context_usage_marks_missing_context_window_as_estimated() -> None:
    # Prompt usage should still be exposed even when context-window tokens are absent.
    run = _build_run_with_usage({"promptTokens": 42, "completionTokens": 7})

    usage = resolve_internal_run_context_usage(run)

    assert usage is not None
    assert usage.context_used_tokens == 42
    # No persisted context window means we report an unavailable window as estimated.
    assert usage.context_window_tokens is None
    assert usage.estimated is True


def test_external_context_usage_uses_persisted_context_window_when_present() -> None:
    # When context-window tokens are persisted at run-time, responses should be authoritative.
    run = _build_run_with_usage(
        {
            "promptTokens": 12,
            "completionTokens": 3,
            "contextWindowTokens": 200000,
        }
    )

    usage = resolve_external_run_context_usage(run)

    assert usage is not None
    assert usage.context_used_tokens == 12
    assert usage.context_window_tokens == 200000
    assert usage.estimated is False


def test_context_usage_does_not_infer_context_window_from_runtime_model_metadata() -> (
    None
):
    # Historical usage must be derived only from persisted run payloads, not live model lookups.
    run = _build_run_with_usage({"promptTokens": 11, "completionTokens": 2})

    usage = resolve_external_run_context_usage(run)

    assert usage is not None
    assert usage.context_used_tokens == 11
    assert usage.context_window_tokens is None
    assert usage.estimated is True


def test_context_usage_ignores_non_finite_usage_scalars() -> None:
    # Non-finite usage telemetry should be ignored instead of raising.
    run = _build_run_with_usage(
        {
            "promptTokens": float("nan"),
            "inputTokens": 17,
            "contextWindowTokens": float("inf"),
        }
    )

    usage = resolve_internal_run_context_usage(run)

    assert usage is not None
    assert usage.context_used_tokens == 17
    assert usage.context_window_tokens is None
    assert usage.estimated is True


def test_external_context_usage_returns_none_when_only_non_finite_values_present() -> (
    None
):
    # If all usage values are non-finite, context telemetry should be unavailable.
    run = _build_run_with_usage(
        {
            "promptTokens": float("nan"),
            "completionTokens": float("inf"),
            "contextWindowTokens": float("-inf"),
        }
    )

    usage = resolve_external_run_context_usage(run)

    assert usage is None


def test_context_usage_rejects_non_integer_numeric_values() -> None:
    # Fractional/negative-fractional values must be treated as unavailable.
    run = _build_run_with_usage(
        {
            "promptTokens": -0.5,
            "inputTokens": "1.9",
            "completionTokens": 1.9,
            "contextWindowTokens": "4096",
        }
    )

    usage = resolve_internal_run_context_usage(run)

    assert usage is not None
    assert usage.context_used_tokens is None
    assert usage.context_window_tokens == 4096
    assert usage.estimated is False


def test_external_context_usage_accepts_codex_camel_case_context_window() -> None:
    run = _build_run_with_usage(
        {
            "inputTokens": 77,
            "modelContextWindow": 258400,
        }
    )

    usage = resolve_external_run_context_usage(run)

    assert usage is not None
    assert usage.context_used_tokens == 77
    assert usage.context_window_tokens == 258400
    assert usage.estimated is False


def test_external_context_usage_accepts_codex_used_tokens_aliases() -> None:
    run = _build_run_with_usage(
        {
            "usedTokens": 88,
            "windowTokens": 272000,
        }
    )

    usage = resolve_external_run_context_usage(run)

    assert usage is not None
    assert usage.context_used_tokens == 88
    assert usage.context_window_tokens == 272000
    assert usage.estimated is False
