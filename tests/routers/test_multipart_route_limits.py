from contextlib import ExitStack
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
import pytest
import pytest_asyncio

from setta.agentic.store import save_engine_configs
from setta.lsp.managers import stop_file_watcher, stop_lsps
from setta.routers.ai import router as ai_router
from setta.routers.binary import router as binary_router
from setta.server_state import SettaFastAPIState
from setta.types.agentic import EngineConfig, EngineType
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs, LLMConfig
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

    async def test_transcribe_chat_audio_accepts_payload_above_starlette_default_part_size(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # Dictation uploads should also respect Setta's configured limit, not the parser default.
        self.app.include_router(ai_router, prefix=Route.PREFIX.value)
        engine_config_id = ID("engine-primary")
        save_engine_configs(
            self.state.dbe,
            [
                EngineConfig(
                    id=engine_config_id,
                    name="Primary Engine",
                    engineType=EngineType.setta_llm,
                    settaLlmConfigId="primary",
                )
            ],
        )
        self.state.agent_runner.update_config(
            AllLLMConfigs(
                configs={
                    "primary": LLMConfig(
                        id="primary",
                        model="gpt-4o-mini",
                        provider="openai",
                        api_key_env="OPENAI_API_KEY",
                        mcpServerIds=[],
                    )
                },
                mcpServers={},
            )
        )
        self.state.agent_runner.update_api_keys({"OPENAI_API_KEY": "test-key"})
        captured_audio: dict[str, bytes] = {}

        async def _fake_transcribe_audio_with_llm(
            *,
            audio_bytes: bytes,
            **_kwargs,
        ) -> str:
            captured_audio["bytes"] = audio_bytes
            return "hello from provider"

        monkeypatch.setattr(
            "setta.routers.ai.transcribe_audio_with_llm",
            _fake_transcribe_audio_with_llm,
        )

        payload = b"a" * (2 * 1024 * 1024)
        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"{Route.PREFIX.value}{Route.TRANSCRIBE_CHAT_AUDIO.value}",
                data={"engineConfigId": str(engine_config_id)},
                files={"file": ("voice.webm", payload, "audio/webm")},
            )

        assert response.status_code == 200
        assert response.json() == {"text": "hello from provider"}
        assert len(captured_audio["bytes"]) == len(payload)
