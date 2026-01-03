import os
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI
from starlette.types import Message, Scope
from starlette.websockets import WebSocket

from setta.auth.manager import AUTH_COOKIE_MANAGER
from setta.database.db_objs import DBE
from setta.database.utils import create_new_id
from setta.routers.terminals import terminal_websocket_endpoint
from setta.routers.websocket import route_websocket_share_frontend
from setta.server_state import SettaFastAPIState
from setta.sessions.constants import SESSION_ID_ENV_VAR, SESSIONS_ROOT_ENV_VAR
from setta.sessions.registry import SessionRegistry
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.utils.constants import C


def _write_share_project(root: Path) -> None:
    dbe = DBE(root)
    project_config = ProjectConfig(name="share-websocket-test")
    project_state = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        defaultProjectConfigId=project_config.id,
    )
    dbe.write_project(project_state)


async def _build_state(root: Path) -> SettaFastAPIState:
    app = FastAPI()
    state = SettaFastAPIState(
        app,
        share_mode=True,
        share_deployment_root=root,
    )
    await state.wait_until_ready()
    return state


def _close_code(messages: list[Message]) -> int | None:
    for message in messages:
        if message.get("type") == "websocket.close":
            return message.get("code")
    return None


async def _build_websocket(
    messages: list[Message],
    *,
    headers: list[tuple[bytes, bytes]] | None = None,
) -> WebSocket:
    receive_queue: list[Message] = [{"type": "websocket.connect"}]

    async def receive() -> Message:
        if receive_queue:
            return receive_queue.pop(0)
        return {"type": "websocket.disconnect", "code": 1000}

    async def send(message: Message) -> None:
        messages.append(message)

    scope: Scope = {
        "type": "websocket",
        "asgi": {"version": "3.0"},
        "scheme": "ws",
        "path": "/",
        "raw_path": b"/",
        "query_string": b"",
        "headers": headers or [],
        "client": ("testclient", 0),
        "server": ("testserver", 80),
        "subprotocols": [],
        "state": {},
    }
    return WebSocket(scope=scope, receive=receive, send=send)


def _mint_auth_cookie(sessions_root: Path) -> tuple[str, str]:
    registry = SessionRegistry(sessions_root=sessions_root)
    metadata = registry.create_session(
        workspace_path=sessions_root,
        host="127.0.0.1",
        port=8000,
        pid=os.getpid(),
    )
    secret = registry.load_secret(metadata)
    token = AUTH_COOKIE_MANAGER.mint(metadata.id, secret)
    return metadata.id, token


class ShareFrontendWebsocketRequirementTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_share_session_closes(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            _write_share_project(root)
            state = await _build_state(root)
            session_id, auth_cookie = _mint_auth_cookie(root / "sessions")
            headers = [
                (
                    b"cookie",
                    f"{C.AUTH_COOKIE_NAME}={auth_cookie}".encode("utf-8"),
                )
            ]
            messages: list[Message] = []
            websocket = await _build_websocket(messages, headers=headers)

            prev_session = os.environ.get(SESSION_ID_ENV_VAR)
            prev_root = os.environ.get(SESSIONS_ROOT_ENV_VAR)
            try:
                os.environ[SESSION_ID_ENV_VAR] = session_id
                os.environ[SESSIONS_ROOT_ENV_VAR] = str(root / "sessions")
                await route_websocket_share_frontend(websocket, state)
            finally:
                if prev_session is None:
                    os.environ.pop(SESSION_ID_ENV_VAR, None)
                else:
                    os.environ[SESSION_ID_ENV_VAR] = prev_session
                if prev_root is None:
                    os.environ.pop(SESSIONS_ROOT_ENV_VAR, None)
                else:
                    os.environ[SESSIONS_ROOT_ENV_VAR] = prev_root

            self.assertEqual(4400, _close_code(messages))

    async def test_unknown_share_session_closes(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            _write_share_project(root)
            state = await _build_state(root)
            session_id, auth_cookie = _mint_auth_cookie(root / "sessions")
            headers = [
                (
                    b"cookie",
                    f"{C.AUTH_COOKIE_NAME}={auth_cookie}".encode("utf-8"),
                ),
                (b"x-share-session-id", b"missing-session"),
            ]
            messages: list[Message] = []
            websocket = await _build_websocket(messages, headers=headers)

            prev_session = os.environ.get(SESSION_ID_ENV_VAR)
            prev_root = os.environ.get(SESSIONS_ROOT_ENV_VAR)
            try:
                os.environ[SESSION_ID_ENV_VAR] = session_id
                os.environ[SESSIONS_ROOT_ENV_VAR] = str(root / "sessions")
                await route_websocket_share_frontend(websocket, state)
            finally:
                if prev_session is None:
                    os.environ.pop(SESSION_ID_ENV_VAR, None)
                else:
                    os.environ[SESSION_ID_ENV_VAR] = prev_session
                if prev_root is None:
                    os.environ.pop(SESSIONS_ROOT_ENV_VAR, None)
                else:
                    os.environ[SESSIONS_ROOT_ENV_VAR] = prev_root

            self.assertEqual(4404, _close_code(messages))


class TerminalWebsocketRequirementTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_share_session_closes(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            _write_share_project(root)
            state = await _build_state(root)
            messages: list[Message] = []
            websocket = await _build_websocket(messages)

            await terminal_websocket_endpoint(
                websocket,
                state.share_project_manager.project_config_id,
                create_new_id(),
                "client-1",
                state,
            )

            self.assertEqual(4400, _close_code(messages))

    async def test_unknown_share_session_closes(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            _write_share_project(root)
            state = await _build_state(root)
            messages: list[Message] = []
            websocket = await _build_websocket(
                messages,
                headers=[(b"x-share-session-id", b"missing-session")],
            )

            await terminal_websocket_endpoint(
                websocket,
                state.share_project_manager.project_config_id,
                create_new_id(),
                "client-2",
                state,
            )

            self.assertEqual(4404, _close_code(messages))


if __name__ == "__main__":
    unittest.main()
