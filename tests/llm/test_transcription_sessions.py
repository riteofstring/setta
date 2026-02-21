from types import SimpleNamespace

import pytest

from setta.llm.transcription_sessions import (
    OpenAIRealtimeTranscriptionEngine,
    TranscriptionSessionManager,
    _is_realtime_fallback_error,
)
from setta.types.agentic import TranscriptionProfile, TranscriptionTransportMode
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


class _ClosableFileEngine:
    def __init__(self) -> None:
        self.close_calls = 0

    async def append_audio(self, *_args, **_kwargs):
        raise RuntimeError("append_audio should not be called in this test")

    async def stop(self):
        raise RuntimeError("stop should not be called in this test")

    async def close(self) -> None:
        self.close_calls += 1


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


@pytest.mark.asyncio
async def test_prune_expired_sessions_closes_expired_engines(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Session pruning should close expired engines even without follow-up API traffic.
    manager = TranscriptionSessionManager(session_ttl_seconds=1)
    llm_config = LLMConfig(
        id="openai-transcribe",
        model="whisper-1",
        provider="openai",
        api_key_env="OPENAI_API_KEY",
        mcpServerIds=[],
    )
    profile = TranscriptionProfile(
        id="profile-1",
        name="File Profile",
        transcriptionLlmConfigId="openai-transcribe",
        transportMode=TranscriptionTransportMode.file,
        chunkMs=1200,
        language=None,
    )
    file_engine = _ClosableFileEngine()

    monkeypatch.setattr(
        "setta.llm.transcription_sessions._build_file_engine",
        lambda **_kwargs: file_engine,
    )

    session_id, _, _ = await manager.start_session(
        scope_id="scope-1",
        resolved_profile=SimpleNamespace(profile=profile, llm_config=llm_config),
        config=AllLLMConfigs(configs={"openai-transcribe": llm_config}, mcpServers={}),
        api_keys={},
        language_override=None,
    )
    manager._sessions[session_id].last_activity_monotonic -= 5

    await manager.prune_expired_sessions()

    assert session_id not in manager._sessions
    assert file_engine.close_calls == 1
