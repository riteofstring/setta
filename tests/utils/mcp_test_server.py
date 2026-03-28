import asyncio
import importlib.util
import secrets
import socket
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

from fastapi import FastAPI

from setta.database.db_objs import DBE
import setta.mcp.tools  # noqa: F401
from setta.mcp.server import SettaFastMCP
from setta.mcp.tool_metadata import SettaToolType
from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.utils.constants import C
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


class _StubProjectManager:
    def __init__(self, project_state_backend: ProjectStateBackend) -> None:
        self.project_state_backend = project_state_backend

    def get_all_project_metadata(self) -> tuple[list[object], list[object]]:
        return [], []


class _StubProjectManagerSwitcher:
    def __init__(self) -> None:
        # Some tools call `project_manager_switcher.main` directly.
        self.main = _StubProjectManager(ProjectStateBackend())

    def get(self, project_config_id: ID, *, share_session_id: str | None = None) -> _StubProjectManager:  # noqa: ARG002
        project_config = ProjectConfig(id=project_config_id)
        project_state_backend = ProjectStateBackend(
            projectConfigs={project_config.id: project_config},
            projectChatWindowingByProjectConfigId={project_config.id: {}},
            defaultProjectConfigId=project_config.id,
        )
        return _StubProjectManager(project_state_backend)


class _StubTerminals:
    def get_terminal_history(self, _terminal_id: object) -> list[object]:
        return []


@dataclass(slots=True)
class MCPTestServer:
    host: str
    port: int
    url: str
    test_tool_name: str | None = None
    test_tool_token: str | None = None
    test_tool_state: dict[str, int] | None = None


@asynccontextmanager
async def run_test_mcp_server() -> AsyncIterator[MCPTestServer]:
    if importlib.util.find_spec("uvicorn") is None:  # pragma: no cover - env dependent
        raise RuntimeError("uvicorn is required for MCP integration tests")
    import uvicorn

    host = "127.0.0.1"
    port = _reserve_port(host)
    original_host = C.HOST
    original_port = C.PORT
    server = None
    server_task: asyncio.Task[None] | None = None
    C.HOST = host
    C.PORT = port
    try:
        with TemporaryDirectory() as tmpdir:
            setta_root = Path(tmpdir) / "setta_files"
            setta_root.mkdir(parents=True, exist_ok=True)
            dbe = DBE(setta_root)
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
            state = SimpleNamespace(
                dbe=dbe,
                agent_runner=SimpleNamespace(disabled=True),
                project_manager_switcher=_StubProjectManagerSwitcher(),
                terminals=_StubTerminals(),
            )
            app = FastAPI()
            test_tool_name = f"test_tool_{secrets.token_hex(6)}"
            test_tool_token = secrets.token_hex(24)
            test_tool_state = {"count": 0}

            def _test_tool() -> dict[str, str]:
                test_tool_state["count"] += 1
                return {"status": "ok", "token": test_tool_token}

            _test_tool.__name__ = test_tool_name

            mcp_server = SettaFastMCP(
                app,
                state,
                "/mcp",
                "Test MCP Server",
                frontend_sender,
                dbe,
            )
            mcp_server._register_setta_tool(_test_tool, SettaToolType.discoverable)
            config = uvicorn.Config(
                app,
                host=host,
                port=port,
                lifespan="on",
                timeout_graceful_shutdown=1,
                log_level="critical",
                access_log=False,
                log_config=None,
            )
            server = uvicorn.Server(config)
            server_task = asyncio.create_task(server.serve())
            await _wait_for_server(host, port)
            try:
                yield MCPTestServer(
                    host=host,
                    port=port,
                    url=f"http://{host}:{port}/mcp",
                    test_tool_name=test_tool_name,
                    test_tool_token=test_tool_token,
                    test_tool_state=test_tool_state,
                )
            finally:
                await mcp_server.terminate_streamable_sessions()
                if server is not None:
                    server.should_exit = True
                    if getattr(server, "started", False):
                        try:
                            await asyncio.wait_for(server.shutdown(), timeout=5)
                            server.force_exit = True
                        except asyncio.TimeoutError:
                            server.force_exit = True
                if server_task is not None:
                    try:
                        await asyncio.wait_for(server_task, timeout=5)
                    except asyncio.TimeoutError:
                        server_task.cancel()
                        with suppress(asyncio.CancelledError):
                            await server_task
    finally:
        C.HOST = original_host
        C.PORT = original_port


def _reserve_port(host: str) -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        return sock.getsockname()[1]


async def _wait_for_server(host: str, port: int) -> None:
    for _ in range(50):
        try:
            reader, writer = await asyncio.open_connection(host, port)
        except OSError:
            await asyncio.sleep(0.1)
            continue
        writer.close()
        await writer.wait_closed()
        return
    raise RuntimeError("Timed out waiting for MCP test server to start")
