from types import SimpleNamespace

import pytest

from setta.llm.transcription_sessions import (
    OpenAIRealtimeTranscriptionEngine,
    _is_realtime_fallback_error,
)
from setta.types.llm_config import AllLLMConfigs, LLMConfig


class _FailingTranscriptionSession:
    async def update(self, *_args, **_kwargs) -> None:
        raise RuntimeError("Realtime transcription is unavailable for this model.")


class _ConnectionManager:
    def __init__(self) -> None:
        self.exited = False
        self.connection = SimpleNamespace(
            transcription_session=_FailingTranscriptionSession()
        )

    async def __aenter__(self):
        return self.connection

    async def __aexit__(self, *_args) -> None:
        self.exited = True


class _RealtimeClient:
    def __init__(self, manager: _ConnectionManager) -> None:
        self._manager = manager

    def connect(self, *_args, **_kwargs) -> _ConnectionManager:
        return self._manager


class _BetaClient:
    def __init__(self, manager: _ConnectionManager) -> None:
        self.realtime = _RealtimeClient(manager)


class _FakeAsyncOpenAI:
    def __init__(self, *, manager: _ConnectionManager, **_kwargs) -> None:
        self.beta = _BetaClient(manager)


@pytest.mark.asyncio
async def test_realtime_create_closes_connection_on_update_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Ensure the realtime connection manager exits if setup fails after __aenter__.
    manager = _ConnectionManager()

    def _build_client(*_args, **_kwargs) -> _FakeAsyncOpenAI:
        return _FakeAsyncOpenAI(manager=manager)

    monkeypatch.setattr("setta.llm.transcription_sessions.AsyncOpenAI", _build_client)

    with pytest.raises(RuntimeError):
        await OpenAIRealtimeTranscriptionEngine.create(
            config=AllLLMConfigs(
                configs={
                    "openai-transcribe": LLMConfig(
                        id="openai-transcribe",
                        model="gpt-4o-mini-transcribe",
                        provider="openai",
                        api_key_env="OPENAI_API_KEY",
                        mcpServerIds=[],
                    )
                },
                mcpServers={},
            ),
            llm_config=LLMConfig(
                id="openai-transcribe",
                model="gpt-4o-mini-transcribe",
                provider="openai",
                api_key_env="OPENAI_API_KEY",
                mcpServerIds=[],
            ),
            api_keys={"OPENAI_API_KEY": "test-key"},
            language=None,
        )
    assert manager.exited is True


def test_realtime_fallback_error_rejects_auth_failures() -> None:
    # Auth/config failures should not be silently downgraded in auto mode.
    assert (
        _is_realtime_fallback_error(KeyError("Missing API key for 'OPENAI_API_KEY'."))
        is False
    )


def test_realtime_fallback_error_accepts_capability_failures() -> None:
    # Explicit realtime capability failures should trigger file fallback in auto mode.
    assert (
        _is_realtime_fallback_error(
            RuntimeError("Realtime transcription is unavailable for this model.")
        )
        is True
    )
