import asyncio
import base64
import io
import time
import wave
from dataclasses import dataclass
from typing import Any

from openai import AsyncOpenAI

from setta.agentic.transcription_profile_resolver import ResolvedTranscriptionProfile
from setta.database.utils import create_new_id
from setta.llm.transcription import transcribe_audio_with_llm
from setta.llm.transcription_capabilities import supports_realtime_transcription
from setta.types.agentic import TranscriptionTransportMode
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs, LLMConfig
from setta.utils.constants import C


@dataclass(slots=True)
class TranscriptDeltaResult:
    append_text: str
    full_text: str
    is_final: bool


class TranscriptionAudioLimitExceededError(ValueError):
    def __init__(self, *, max_bytes: int) -> None:
        self.max_bytes = max_bytes
        super().__init__(
            "File-mode transcription session exceeded buffered audio size limit."
        )


class BaseTranscriptionEngine:
    async def append_audio(
        self,
        *,
        audio_pcm16: bytes,
        sample_rate_hz: int,
        channels: int,
    ) -> TranscriptDeltaResult:
        raise NotImplementedError

    async def stop(self) -> TranscriptDeltaResult:
        raise NotImplementedError

    async def close(self) -> None:
        raise NotImplementedError


def _append_transcript_segment(existing: str, raw_segment: str) -> tuple[str, str]:
    segment = raw_segment.strip()
    if not segment:
        return "", existing
    needs_space = (
        bool(existing)
        and not existing.endswith((" ", "\n"))
        and not segment.startswith((".", ",", "!", "?", ";", ":", ")", "]", "}"))
    )
    append_text = f" {segment}" if needs_space else segment
    return append_text, f"{existing}{append_text}"


def _resolve_api_key(api_keys: dict[str, str], api_key_env: str | None) -> str | None:
    if api_key_env is None:
        return None
    api_key = api_keys.get(api_key_env)
    if not api_key:
        raise KeyError(
            f"Missing API key for '{api_key_env}'. Configure it in LLM API Keys."
        )
    return api_key


class FileTranscriptionEngine(BaseTranscriptionEngine):
    def __init__(
        self,
        *,
        config: AllLLMConfigs,
        llm_config: LLMConfig,
        api_keys: dict[str, str],
        language: str | None,
        max_pending_pcm_bytes: int,
    ) -> None:
        self._config = config
        self._llm_config = llm_config
        self._api_keys = api_keys
        self._language = language
        self._max_pending_pcm_bytes = max_pending_pcm_bytes
        self._pending_pcm = bytearray()
        self._full_text = ""
        self._sample_rate_hz: int | None = None
        self._channels: int | None = None
        self._lock = asyncio.Lock()

    async def append_audio(
        self,
        *,
        audio_pcm16: bytes,
        sample_rate_hz: int,
        channels: int,
    ) -> TranscriptDeltaResult:
        if sample_rate_hz <= 0:
            raise ValueError("sampleRateHz must be greater than 0.")
        if channels <= 0:
            raise ValueError("channels must be greater than 0.")
        if len(audio_pcm16) % 2 != 0:
            raise ValueError("PCM16 payload must have an even byte length.")
        async with self._lock:
            if self._sample_rate_hz is None:
                self._sample_rate_hz = sample_rate_hz
                self._channels = channels
            if self._sample_rate_hz != sample_rate_hz:
                raise ValueError(
                    "sampleRateHz cannot change within a transcription session."
                )
            if self._channels != channels:
                raise ValueError(
                    "channels cannot change within a transcription session."
                )

            next_pending_size = len(self._pending_pcm) + len(audio_pcm16)
            if next_pending_size > self._max_pending_pcm_bytes:
                raise TranscriptionAudioLimitExceededError(
                    max_bytes=self._max_pending_pcm_bytes
                )
            self._pending_pcm.extend(audio_pcm16)
            append_accumulator = ""
            return TranscriptDeltaResult(
                append_text=append_accumulator,
                full_text=self._full_text,
                is_final=False,
            )

    async def stop(self) -> TranscriptDeltaResult:
        async with self._lock:
            append_text = ""
            if self._sample_rate_hz is not None and self._channels is not None:
                if len(self._pending_pcm) > 0:
                    text = await self._transcribe_pcm_window(
                        bytes(self._pending_pcm),
                        sample_rate_hz=self._sample_rate_hz,
                        channels=self._channels,
                    )
                    append_text, self._full_text = _append_transcript_segment(
                        self._full_text,
                        text,
                    )
                self._pending_pcm.clear()
            return TranscriptDeltaResult(
                append_text=append_text,
                full_text=self._full_text,
                is_final=True,
            )

    async def close(self) -> None:
        self._pending_pcm.clear()

    async def _transcribe_pcm_window(
        self,
        pcm_window: bytes,
        *,
        sample_rate_hz: int,
        channels: int,
    ) -> str:
        wav_bytes = _pcm16_to_wav_bytes(
            pcm_window,
            sample_rate_hz=sample_rate_hz,
            channels=channels,
        )
        return await transcribe_audio_with_llm(
            config=self._config,
            llm_config=self._llm_config,
            api_keys=self._api_keys,
            audio_bytes=wav_bytes,
            mime_type="audio/wav",
            file_name="dictation-window.wav",
            language=self._language,
        )


class OpenAIRealtimeTranscriptionEngine(BaseTranscriptionEngine):
    def __init__(
        self,
        *,
        connection_manager: Any,
        connection: Any,
    ) -> None:
        self._connection_manager = connection_manager
        self._connection = connection
        self._closed = False
        self._lock = asyncio.Lock()
        self._completed_item_ids: set[str] = set()
        self._full_text = ""

    @classmethod
    async def create(
        cls,
        *,
        config: AllLLMConfigs,
        llm_config: LLMConfig,
        api_keys: dict[str, str],
        language: str | None,
    ) -> "OpenAIRealtimeTranscriptionEngine":
        request_payload, api_key_env = config.build_llm_params(llm_config)
        api_key = _resolve_api_key(api_keys, api_key_env)
        api_base_raw = request_payload.get("api_base")
        api_base = api_base_raw if isinstance(api_base_raw, str) else None
        client = AsyncOpenAI(api_key=api_key, base_url=api_base)
        model = llm_config.model
        connection_manager = client.beta.realtime.connect(model=model)
        connection: Any | None = None
        try:
            connection = await connection_manager.__aenter__()
            input_audio_transcription: dict[str, str] = {"model": model}
            if language:
                input_audio_transcription["language"] = language
            await connection.transcription_session.update(
                session={
                    "input_audio_format": "pcm16",
                    "input_audio_transcription": input_audio_transcription,
                }
            )
            return cls(connection_manager=connection_manager, connection=connection)
        except Exception as exc:
            if connection is not None:
                await connection_manager.__aexit__(type(exc), exc, exc.__traceback__)
            raise

    async def append_audio(
        self,
        *,
        audio_pcm16: bytes,
        sample_rate_hz: int,
        channels: int,
    ) -> TranscriptDeltaResult:
        if channels != 1:
            raise ValueError("Realtime transcription requires mono PCM16 audio.")
        if sample_rate_hz != 24_000:
            raise ValueError("Realtime transcription requires 24kHz PCM16 audio.")
        if len(audio_pcm16) % 2 != 0:
            raise ValueError("PCM16 payload must have an even byte length.")

        async with self._lock:
            payload_b64 = base64.b64encode(audio_pcm16).decode("ascii")
            await self._connection.input_audio_buffer.append(audio=payload_b64)
            await self._connection.input_audio_buffer.commit()
            append_text = await self._drain_events(timeout_seconds=0.45)
            return TranscriptDeltaResult(
                append_text=append_text,
                full_text=self._full_text,
                is_final=False,
            )

    async def stop(self) -> TranscriptDeltaResult:
        async with self._lock:
            append_text = await self._drain_events(timeout_seconds=1.2)
            return TranscriptDeltaResult(
                append_text=append_text,
                full_text=self._full_text,
                is_final=True,
            )

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        await self._connection_manager.__aexit__(None, None, None)

    async def _drain_events(self, *, timeout_seconds: float) -> str:
        deadline = time.monotonic() + timeout_seconds
        append_accumulator = ""
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            try:
                event = await asyncio.wait_for(
                    self._connection.recv(),
                    timeout=remaining,
                )
            except TimeoutError:
                break
            append_text = self._handle_event(event)
            if append_text:
                append_accumulator = f"{append_accumulator}{append_text}"
        return append_accumulator

    def _handle_event(self, event: Any) -> str:
        event_type = _event_value(event, "type")
        if event_type == "conversation.item.input_audio_transcription.completed":
            item_id = _event_value(event, "item_id")
            if isinstance(item_id, str) and item_id in self._completed_item_ids:
                return ""
            if isinstance(item_id, str):
                self._completed_item_ids.add(item_id)
            transcript_raw = _event_value(event, "transcript")
            transcript = transcript_raw if isinstance(transcript_raw, str) else ""
            append_text, self._full_text = _append_transcript_segment(
                self._full_text,
                transcript,
            )
            return append_text
        if event_type == "conversation.item.input_audio_transcription.failed":
            error_payload = _event_value(event, "error")
            error_message = _event_value(error_payload, "message")
            if isinstance(error_message, str) and error_message.strip():
                raise RuntimeError(error_message.strip())
            raise RuntimeError("Realtime transcription failed.")
        if event_type == "error":
            error_payload = _event_value(event, "error")
            error_message = _event_value(error_payload, "message")
            if isinstance(error_message, str) and error_message.strip():
                raise RuntimeError(error_message.strip())
            raise RuntimeError("Realtime transcription failed.")
        return ""


def _event_value(payload: Any, key: str) -> Any:
    if payload is None:
        return None
    if isinstance(payload, dict):
        return payload.get(key)
    return getattr(payload, key, None)


@dataclass(slots=True)
class _ActiveTranscriptionSession:
    scope_id: str
    engine: BaseTranscriptionEngine
    last_activity_monotonic: float
    in_flight_operations: int = 0


class TranscriptionSessionManager:
    def __init__(self, *, session_ttl_seconds: int = 60 * 10) -> None:
        self._session_ttl_seconds = session_ttl_seconds
        self._sessions: dict[ID, _ActiveTranscriptionSession] = {}
        self._lock = asyncio.Lock()

    async def start_session(
        self,
        *,
        scope_id: str,
        resolved_profile: ResolvedTranscriptionProfile,
        config: AllLLMConfigs,
        api_keys: dict[str, str],
        language_override: str | None,
    ) -> tuple[ID, str, int]:
        profile = resolved_profile.profile
        llm_config = resolved_profile.llm_config
        if llm_config is None:
            raise ValueError(
                "Transcription config is missing or invalid for this transcription profile."
            )

        language = language_override if language_override else profile.language
        transport_mode = profile.transportMode
        supports_realtime = supports_realtime_transcription(llm_config)

        if (
            transport_mode == TranscriptionTransportMode.realtime
            and not supports_realtime
        ):
            raise ValueError(
                "Realtime transcription is unavailable for this provider/model."
            )

        resolved_transport_mode = "file"
        engine: BaseTranscriptionEngine
        if transport_mode == TranscriptionTransportMode.file:
            engine = _build_file_engine(
                config=config,
                llm_config=llm_config,
                api_keys=api_keys,
                language=language,
            )
        elif transport_mode == TranscriptionTransportMode.realtime:
            engine = await OpenAIRealtimeTranscriptionEngine.create(
                config=config,
                llm_config=llm_config,
                api_keys=api_keys,
                language=language,
            )
            resolved_transport_mode = "realtime"
        else:
            if supports_realtime:
                try:
                    engine = await OpenAIRealtimeTranscriptionEngine.create(
                        config=config,
                        llm_config=llm_config,
                        api_keys=api_keys,
                        language=language,
                    )
                    resolved_transport_mode = "realtime"
                except Exception as exc:
                    if not _is_realtime_fallback_error(exc):
                        raise
                    engine = _build_file_engine(
                        config=config,
                        llm_config=llm_config,
                        api_keys=api_keys,
                        language=language,
                    )
                    resolved_transport_mode = "file"
            else:
                engine = _build_file_engine(
                    config=config,
                    llm_config=llm_config,
                    api_keys=api_keys,
                    language=language,
                )

        session_id = create_new_id()
        now = time.monotonic()
        await self._close_expired_sessions(now)
        async with self._lock:
            self._sessions[session_id] = _ActiveTranscriptionSession(
                scope_id=scope_id,
                engine=engine,
                last_activity_monotonic=now,
            )
        chunk_ms = profile.chunkMs if resolved_transport_mode == "realtime" else 0
        return session_id, resolved_transport_mode, chunk_ms

    async def prune_expired_sessions(self) -> None:
        await self._close_expired_sessions(time.monotonic())

    async def append_audio(
        self,
        *,
        scope_id: str,
        session_id: ID,
        audio_pcm16: bytes,
        sample_rate_hz: int,
        channels: int,
    ) -> TranscriptDeltaResult:
        session = await self._mark_append_in_flight(
            scope_id=scope_id, session_id=session_id
        )
        try:
            return await session.engine.append_audio(
                audio_pcm16=audio_pcm16,
                sample_rate_hz=sample_rate_hz,
                channels=channels,
            )
        finally:
            await self._mark_append_complete(
                scope_id=scope_id,
                session_id=session_id,
                session=session,
            )

    async def stop_session(
        self,
        *,
        scope_id: str,
        session_id: ID,
    ) -> TranscriptDeltaResult:
        session = await self._pop_active_session(
            scope_id=scope_id, session_id=session_id
        )
        try:
            return await session.engine.stop()
        finally:
            await session.engine.close()

    async def cancel_session(
        self,
        *,
        scope_id: str,
        session_id: ID,
    ) -> None:
        session = await self._pop_active_session(
            scope_id=scope_id, session_id=session_id
        )
        await session.engine.close()

    async def _mark_append_in_flight(
        self,
        *,
        scope_id: str,
        session_id: ID,
    ) -> _ActiveTranscriptionSession:
        now = time.monotonic()
        await self._close_expired_sessions(now)
        async with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                raise KeyError(f"Transcription session {session_id} not found")
            if session.scope_id != scope_id:
                raise KeyError(f"Transcription session {session_id} not found")
            session.last_activity_monotonic = now
            session.in_flight_operations += 1
            return session

    async def _mark_append_complete(
        self,
        *,
        scope_id: str,
        session_id: ID,
        session: _ActiveTranscriptionSession,
    ) -> None:
        async with self._lock:
            active_session = self._sessions.get(session_id)
            if active_session is None:
                return
            if active_session is not session:
                return
            if active_session.scope_id != scope_id:
                return
            active_session.last_activity_monotonic = time.monotonic()
            if active_session.in_flight_operations > 0:
                active_session.in_flight_operations -= 1

    async def _pop_active_session(
        self,
        *,
        scope_id: str,
        session_id: ID,
    ) -> _ActiveTranscriptionSession:
        await self._close_expired_sessions(time.monotonic())
        async with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                raise KeyError(f"Transcription session {session_id} not found")
            if session.scope_id != scope_id:
                raise KeyError(f"Transcription session {session_id} not found")
            return self._sessions.pop(session_id)

    async def _close_expired_sessions(self, now: float) -> None:
        expired: list[_ActiveTranscriptionSession] = []
        async with self._lock:
            for session_id in list(self._sessions.keys()):
                session = self._sessions[session_id]
                if session.in_flight_operations > 0:
                    continue
                if now - session.last_activity_monotonic <= self._session_ttl_seconds:
                    continue
                expired.append(self._sessions.pop(session_id))
        for session in expired:
            try:
                await session.engine.close()
            except Exception:
                continue


def _build_file_engine(
    *,
    config: AllLLMConfigs,
    llm_config: LLMConfig,
    api_keys: dict[str, str],
    language: str | None,
) -> FileTranscriptionEngine:
    max_pending_pcm_bytes = C.TRANSCRIPTION_FILE_SESSION_MAX_BYTES
    if max_pending_pcm_bytes <= 0:
        max_pending_pcm_bytes = 25 * 1024 * 1024
    return FileTranscriptionEngine(
        config=config,
        llm_config=llm_config,
        api_keys=api_keys,
        language=language,
        max_pending_pcm_bytes=max_pending_pcm_bytes,
    )


def _is_realtime_fallback_error(exc: Exception) -> bool:
    if isinstance(exc, KeyError):
        return False
    status_code = getattr(exc, "status_code", None)
    if isinstance(status_code, int):
        if status_code in (401, 403):
            return False
        if status_code not in (400, 404, 422):
            return False
    message = str(exc).strip().lower()
    if not message:
        return False
    if any(
        marker in message
        for marker in (
            "missing api key",
            "authentication",
            "unauthorized",
            "forbidden",
            "permission denied",
        )
    ):
        return False
    return any(
        marker in message
        for marker in (
            "realtime transcription is unavailable",
            "does not support realtime",
            "realtime is not supported",
            "input_audio_transcription",
            "unsupported realtime",
        )
    )


def _pcm16_to_wav_bytes(
    audio_pcm16: bytes,
    *,
    sample_rate_hz: int,
    channels: int,
) -> bytes:
    stream = io.BytesIO()
    with wave.open(stream, "wb") as wav_file:
        wav_file.setnchannels(channels)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate_hz)
        wav_file.writeframes(audio_pcm16)
    return stream.getvalue()
