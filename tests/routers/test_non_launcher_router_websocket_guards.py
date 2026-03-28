from dataclasses import dataclass, field
from types import SimpleNamespace

from fastapi import FastAPI, WebSocket
from fastapi.testclient import TestClient
import pytest
from starlette.websockets import WebSocketDisconnect

from setta.routers.setta_api_router import SettaNonLauncherAPIRouter
from setta.routers.terminals import terminals_ws_router
from setta.types.id import ID
from setta.types.routes import Route


async def _wait_until_ready() -> None:
    return


def _terminal_path() -> str:
    return f"{Route.PREFIX.value}/project-1/section-1/client-1"


def _build_state(
    *,
    launcher_mode: bool,
    terminals: "_TerminalsSpy | None" = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        deployment_mode=False,
        launcher_mode=launcher_mode,
        share_mode=False,
        wait_until_ready=_wait_until_ready,
        terminals=terminals if terminals is not None else _TerminalsSpy(),
        wmh_frontend_sender=object(),
    )


@dataclass(slots=True)
class _TerminalsSpy:
    new_terminal_calls: list[tuple[ID, str, str | None]] = field(default_factory=list)
    connect_calls: list[tuple[str, str]] = field(default_factory=list)
    disconnect_calls: list[tuple[str, str]] = field(default_factory=list)

    def new_terminal(
        self,
        project_config_id: ID,
        terminal_id: str,
        *,
        share_session_id: str | None = None,
    ) -> None:
        self.new_terminal_calls.append((project_config_id, terminal_id, share_session_id))

    async def connect(self, websocket: WebSocket, terminal_id: str, client_id: str) -> bool:
        self.connect_calls.append((terminal_id, client_id))
        await websocket.accept()
        await websocket.close(code=1000)
        return False

    async def write_to_terminal(
        self,
        websocket: WebSocket,
        terminal_id: str,
        *,
        allow_input: bool,
        on_activity,
    ) -> None:
        raise AssertionError(
            "write_to_terminal should not be reached in this test: "
            f"terminal_id={terminal_id} allow_input={allow_input} "
            f"state={websocket.application_state} "
            f"on_activity={on_activity is not None}"
        )

    def disconnect(self, terminal_id: str, client_id: str) -> None:
        self.disconnect_calls.append((terminal_id, client_id))


def test_non_launcher_router_websocket_allows_non_launcher_mode() -> None:
    # Router-level guard should allow websocket handshakes outside launcher mode.
    router = SettaNonLauncherAPIRouter()

    @router.websocket(Route.WEBSOCKET_FRONTEND)
    async def _route(websocket: WebSocket) -> None:
        await websocket.accept()
        await websocket.send_text("ok")
        await websocket.close()

    app = FastAPI()
    app.state.setta = _build_state(launcher_mode=False)
    app.include_router(router)

    with TestClient(app) as client:
        with client.websocket_connect(Route.WEBSOCKET_FRONTEND.value) as websocket:
            assert websocket.receive_text() == "ok"


def test_non_launcher_router_websocket_rejects_launcher_mode() -> None:
    # Launcher mode must fail closed for websocket routes with code 4403.
    router = SettaNonLauncherAPIRouter()

    @router.websocket(Route.WEBSOCKET_FRONTEND)
    async def _route(websocket: WebSocket) -> None:
        await websocket.accept()
        await websocket.send_text("should-not-run")
        await websocket.close()

    app = FastAPI()
    app.state.setta = _build_state(launcher_mode=True)
    app.include_router(router)

    with TestClient(app) as client:
        with pytest.raises(WebSocketDisconnect) as exc:
            with client.websocket_connect(Route.WEBSOCKET_FRONTEND.value) as websocket:
                websocket.receive_text()
    assert exc.value.code == 4403


def test_terminals_websocket_route_reaches_handler_in_non_launcher_mode() -> None:
    # Integration check: terminals websocket should reach handler path in IDE mode.
    terminals = _TerminalsSpy()
    app = FastAPI()
    app.state.setta = _build_state(launcher_mode=False, terminals=terminals)
    app.include_router(terminals_ws_router, prefix=Route.PREFIX.value)

    with TestClient(app) as client:
        with client.websocket_connect(_terminal_path()):
            pass

    assert len(terminals.new_terminal_calls) == 1
    assert len(terminals.connect_calls) == 1
    assert len(terminals.disconnect_calls) == 1


def test_terminals_websocket_route_rejects_launcher_mode_before_handler() -> None:
    # Launcher guard should reject before any terminal handler side effects run.
    terminals = _TerminalsSpy()
    app = FastAPI()
    app.state.setta = _build_state(launcher_mode=True, terminals=terminals)
    app.include_router(terminals_ws_router, prefix=Route.PREFIX.value)

    with TestClient(app) as client:
        with pytest.raises(WebSocketDisconnect) as exc:
            with client.websocket_connect(_terminal_path()) as websocket:
                websocket.receive_text()
    assert exc.value.code == 4403
    assert len(terminals.new_terminal_calls) == 0
    assert len(terminals.connect_calls) == 0
    assert len(terminals.disconnect_calls) == 0
