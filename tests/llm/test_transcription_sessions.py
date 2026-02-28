import asyncio
from types import SimpleNamespace

import pytest

from setta.llm.transcription_sessions import (
    FileTranscriptionEngine,
    OpenAIRealtimeTranscriptionEngine,
    TranscriptDeltaResult,
    TranscriptionAudioLimitExceededError,
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


class _BlockingAppendEngine:
    def __init__(self) -> None:
        self.append_started = asyncio.Event()
        self.append_continue = asyncio.Event()

    async def append_audio(self, *_args, **_kwargs):
        self.append_started.set()
        await self.append_continue.wait()
        return TranscriptDeltaResult(
            append_text="",
            full_text="",
            is_final=False,
        )

    async def stop(self):
        return TranscriptDeltaResult(
            append_text="",
            full_text="",
            is_final=True,
        )

    async def close(self) -> None:
        return None


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


@pytest.mark.asyncio
async def test_file_engine_enforces_cumulative_session_audio_cap() -> None:
    # File-mode buffering should fail early once cumulative PCM exceeds the cap.
    llm_config = LLMConfig(
        id="openai-transcribe",
        model="whisper-1",
        provider="openai",
        api_key_env="OPENAI_API_KEY",
        mcpServerIds=[],
    )
    engine = FileTranscriptionEngine(
        config=AllLLMConfigs(configs={"openai-transcribe": llm_config}, mcpServers={}),
        llm_config=llm_config,
        api_keys={},
        language=None,
        max_pending_pcm_bytes=8,
    )

    await engine.append_audio(
        audio_pcm16=b"\x00\x00\x01\x00",
        sample_rate_hz=24_000,
        channels=1,
    )
    with pytest.raises(TranscriptionAudioLimitExceededError):
        await engine.append_audio(
            audio_pcm16=b"\x02\x00\x03\x00\x04\x00",
            sample_rate_hz=24_000,
            channels=1,
        )
    assert len(engine._pending_pcm) == 4


@pytest.mark.asyncio
async def test_prune_skips_session_while_append_is_in_flight(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Pruning should not race in-flight append calls near TTL boundaries.
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
    blocking_engine = _BlockingAppendEngine()
    monkeypatch.setattr(
        "setta.llm.transcription_sessions._build_file_engine",
        lambda **_kwargs: blocking_engine,
    )

    session_id, _, _ = await manager.start_session(
        scope_id="scope-1",
        resolved_profile=SimpleNamespace(profile=profile, llm_config=llm_config),
        config=AllLLMConfigs(configs={"openai-transcribe": llm_config}, mcpServers={}),
        api_keys={},
        language_override=None,
    )
    append_task = asyncio.create_task(
        manager.append_audio(
            scope_id="scope-1",
            session_id=session_id,
            audio_pcm16=b"\x00\x00",
            sample_rate_hz=24_000,
            channels=1,
        )
    )
    await blocking_engine.append_started.wait()
    manager._sessions[session_id].last_activity_monotonic -= 5
    await manager.prune_expired_sessions()
    assert session_id in manager._sessions
    assert manager._sessions[session_id].in_flight_operations == 1

    blocking_engine.append_continue.set()
    result = await append_task
    assert result.is_final is False

    manager._sessions[session_id].last_activity_monotonic -= 5
    await manager.prune_expired_sessions()
    assert session_id not in manager._sessions
