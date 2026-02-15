import base64
from contextlib import ExitStack
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
import pytest
import pytest_asyncio

from setta.llm.transcription_sessions import TranscriptDeltaResult
from setta.lsp.managers import stop_file_watcher, stop_lsps
from setta.routers.ai import router as ai_router
from setta.routers.binary import router as binary_router
from setta.server_state import SettaFastAPIState
from setta.types.routes import Route
from setta.utils.constants import C
from tests.utils.manager_fixture import _seed_minimal_setta_files
from tests.utils.setta_paths import temporary_setta_paths


async def _shutdown_state(state: SettaFastAPIState) -> None:
    if state.specific_file_watcher:
        state.specific_file_watcher.stop()
    if not state.mcp_client.disabled:
        await state.mcp_client.stop()
    if state.lsps and state.lsp_readers:
        await stop_lsps(state.lsps, state.lsp_readers)
    if state.lsp_writers:
        stop_file_watcher(state.lsp_writers)


class TestMultipartRouteLimits:
    pytestmark = pytest.mark.asyncio

    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self):
        self._temp_dir = TemporaryDirectory()
        root = Path(self._temp_dir.name)
        self._stack = ExitStack()
        self._stack.enter_context(
            temporary_setta_paths(
                workspace_root=root,
                setta_files_location="local",
            )
        )
        for path in (
            C.SETTA_FILES_FOLDER,
            C.CODE_FOLDER,
            C.DB_BACKUP_FOLDER,
            C.ARTIFACTS_FOLDER,
            C.RUNTIME_FOLDER,
            C.RUNTIME_SESSIONS_FOLDER,
            C.RUNTIME_LOGS_FOLDER,
            C.RUNTIME_MCP_FOLDER,
            C.RUNTIME_SECRETS_FOLDER,
            C.DETACHED_RUNS_FOLDER,
            C.SHARE_DEPLOYMENTS_FOLDER,
        ):
            path.mkdir(parents=True, exist_ok=True)
        _seed_minimal_setta_files(C.SETTA_FILES_FOLDER)

        self.app = FastAPI()
        self.state = SettaFastAPIState(
            self.app,
            enable_mcp_connections=False,
            enable_language_server=False,
        )
        self.app.state.setta = self.state
        await self.state.wait_until_ready()
        try:
            yield
        finally:
            await _shutdown_state(self.state)
            self._stack.close()
            self._temp_dir.cleanup()

    async def test_binary_upload_accepts_payload_above_starlette_default_part_size(
        self,
    ) -> None:
        # Route-level multipart sizing should allow files larger than Starlette's 1 MB default.
        self.app.include_router(binary_router, prefix=Route.PREFIX.value)
        payload = b"x" * (2 * 1024 * 1024)

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"{Route.PREFIX.value}{Route.BINARY_UPLOAD.value}",
                files={"file": ("payload.bin", payload, "application/octet-stream")},
            )

        assert response.status_code == 200
        assert response.json()["byteLength"] == len(payload)

    async def test_append_transcription_audio_accepts_large_json_audio_payload(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        self.app.include_router(ai_router, prefix=Route.PREFIX.value)
        payload = b"a" * (2 * 1024 * 1024)
        captured: dict[str, bytes] = {}

        async def _fake_append_audio(
            *,
            scope_id: str,
            session_id: str,
            audio_pcm16: bytes,
            sample_rate_hz: int,
            channels: int,
        ) -> TranscriptDeltaResult:
            captured["scope_id"] = scope_id.encode("utf-8")
            captured["session_id"] = session_id.encode("utf-8")
            captured["audio_pcm16"] = audio_pcm16
            captured["sample_rate_hz"] = str(sample_rate_hz).encode("utf-8")
            captured["channels"] = str(channels).encode("utf-8")
            return TranscriptDeltaResult(
                append_text="hello",
                full_text="hello",
                is_final=False,
            )

        monkeypatch.setattr(
            self.state.transcription_session_manager,
            "append_audio",
            _fake_append_audio,
        )

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"{Route.PREFIX.value}{Route.APPEND_TRANSCRIPTION_AUDIO.value}",
                json={
                    "sessionId": "session-1",
                    "audioPcm16Base64": base64.b64encode(payload).decode("ascii"),
                    "sampleRateHz": 24_000,
                    "channels": 1,
                },
            )

        assert response.status_code == 200
        assert response.json() == {
            "appendText": "hello",
            "fullText": "hello",
            "isFinal": False,
        }
        assert len(captured["audio_pcm16"]) == len(payload)

    async def test_append_transcription_audio_openapi_declares_json_request_body(
        self,
    ) -> None:
        self.app.include_router(ai_router, prefix=Route.PREFIX.value)
        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/openapi.json")

        assert response.status_code == 200
        payload = response.json()
        path_key = f"{Route.PREFIX.value}{Route.APPEND_TRANSCRIPTION_AUDIO.value}"
        assert path_key in payload["paths"]
        post_operation = payload["paths"][path_key]["post"]
        request_body = post_operation.get("requestBody")
        assert isinstance(request_body, dict)
        content = request_body.get("content")
        assert isinstance(content, dict)
        assert "application/json" in content
        assert "multipart/form-data" not in content

    async def test_append_transcription_audio_rejects_unauthorized_before_decode(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        self.app.include_router(ai_router, prefix=Route.PREFIX.value)
        decode_called = False

        async def _reject_llm(_ctx) -> None:
            raise HTTPException(status_code=403, detail="LLM disabled")

        def _fail_decode(_payload: str) -> bytes:
            nonlocal decode_called
            decode_called = True
            raise AssertionError("decode should not run before auth")

        monkeypatch.setattr(
            "setta.runtime.context.RuntimeContext.enforce_llm_allowed",
            _reject_llm,
        )
        monkeypatch.setattr("setta.routers.ai._decode_pcm16_payload", _fail_decode)

        transport = ASGITransport(app=self.app)
        async with AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            response = await client.post(
                f"{Route.PREFIX.value}{Route.APPEND_TRANSCRIPTION_AUDIO.value}",
                json={
                    "sessionId": "session-1",
                    "audioPcm16Base64": "this-is-not-base64",
                    "sampleRateHz": 24_000,
                    "channels": 1,
                },
            )

        assert response.status_code == 403
        assert response.json() == {"detail": "LLM disabled"}
        assert decode_called is False

    async def test_append_transcription_audio_rejects_oversized_payload_before_decode(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        self.app.include_router(ai_router, prefix=Route.PREFIX.value)
        decode_called = False

        def _fail_decode(*_args, **_kwargs):
            nonlocal decode_called
            decode_called = True
            raise AssertionError("decode should not run for oversized payloads")

        monkeypatch.setattr("setta.routers.ai.base64.b64decode", _fail_decode)

        max_bytes = (
            C.REALTIME_BINARY_MAX_BYTES
            if C.REALTIME_BINARY_MAX_BYTES > 0
            else 10 * 1024 * 1024
        )
        encoded_length = ((max_bytes + 3) // 3) * 4

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"{Route.PREFIX.value}{Route.APPEND_TRANSCRIPTION_AUDIO.value}",
                json={
                    "sessionId": "session-oversized",
                    "audioPcm16Base64": "A" * encoded_length,
                    "sampleRateHz": 24_000,
                    "channels": 1,
                },
            )

        assert response.status_code == 413
        assert decode_called is False
