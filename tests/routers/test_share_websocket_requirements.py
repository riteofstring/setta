import asyncio
import os
from datetime import timedelta
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI
import pytest
from starlette.types import Message, Scope
from starlette.websockets import WebSocket

from setta.auth.cookies import auth_cookie_name
from setta.auth.manager import AUTH_COOKIE_MANAGER
from setta.database.db_objs import DBE
from setta.database.utils import create_new_id
from setta.routers.dependencies import require_share_session_id_from_websocket
from setta.routers.terminals import terminal_websocket_endpoint
from setta.routers.websocket import route_websocket_share_frontend
from setta.server_state import SettaFastAPIState
from setta.sessions.constants import SESSION_ID_ENV_VAR, SESSIONS_ROOT_ENV_VAR
from setta.sessions.registry import SessionRegistry
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.types.share_deployment import ShareDeploymentManifest, SharePolicy
from setta.types.websocket import WebsocketMsgCurrentAddressUpdate
from setta.utils.timestamps import get_now_timestamp
from setta.terminals.terminals import build_terminal_id
from setta.utils.constants import C
from tests.utils.runtime_context import runtime_context


def _build_share_deployment_root(
    tmpdir: str,
    project_config_name: str,
    deployment_version: str = "v1",
) -> Path:
    root = (
        Path(tmpdir)
        / "share_deployments"
        / project_config_name
        / deployment_version
    )
    root.mkdir(parents=True, exist_ok=True)
    return root


def _write_share_project(
    root: Path,
    *,
    project_config_name: str,
    deployment_version: str,
) -> None:
    dbe = DBE(root)
    project_config = ProjectConfig(name=project_config_name)
    project_state = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        defaultProjectConfigId=project_config.id,
    )
    dbe.write_project(project_state)
    deployment_name = root.parent.name
    manifest = ShareDeploymentManifest(
        version=1,
        deploymentName=deployment_name,
        defaultProjectConfigId=project_config.id,
        deploymentVersion=deployment_version,
    )
    dbe.write_json(root / "manifest.json", manifest.model_dump())


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


async def _build_websocket_with_text_messages(
    messages: list[Message],
    *,
    text_messages: list[str],
    headers: list[tuple[bytes, bytes]] | None = None,
    message_delay_seconds: float = 0.0,
    message_ready_event: asyncio.Event | None = None,
    message_gate: asyncio.Event | None = None,
) -> WebSocket:
    receive_queue: list[Message] = [{"type": "websocket.connect"}]
    text_queue = list(text_messages)

    async def receive() -> Message:
        if receive_queue:
            return receive_queue.pop(0)
        if text_queue:
            if message_delay_seconds:
                await asyncio.sleep(message_delay_seconds)
            if message_ready_event is not None:
                message_ready_event.set()
            if message_gate is not None:
                await message_gate.wait()
            return {"type": "websocket.receive", "text": text_queue.pop(0)}
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


class TestShareFrontendWebsocketRequirements:
    pytestmark = pytest.mark.asyncio

    async def test_share_frontend_allows_missing_auth_cookie(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-websocket-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            state = await _build_state(root)
            session = state.share_session_store.create_session()
            headers = [(b"x-share-session-id", session.id.encode("utf-8"))]
            messages: list[Message] = []
            websocket = await _build_websocket(messages, headers=headers)

            await route_websocket_share_frontend(websocket, state)

            assert _close_code(messages) is None
            assert any(
                message.get("type") == "websocket.accept" for message in messages
            )

    async def test_missing_share_session_closes(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-websocket-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            state = await _build_state(root)
            session_id, auth_cookie = _mint_auth_cookie(root / "sessions")
            cookie_name = auth_cookie_name(session_id)
            headers = [
                (
                    b"cookie",
                    f"{cookie_name}={auth_cookie}".encode("utf-8"),
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

            assert _close_code(messages) == 4400

    async def test_unknown_share_session_closes(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-websocket-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            state = await _build_state(root)
            session_id, auth_cookie = _mint_auth_cookie(root / "sessions")
            cookie_name = auth_cookie_name(session_id)
            headers = [
                (
                    b"cookie",
                    f"{cookie_name}={auth_cookie}".encode("utf-8"),
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

            assert _close_code(messages) == 4404

    async def test_share_frontend_message_touches_session(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-websocket-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            state = await _build_state(root)
            session = state.share_session_store.create_session()
            headers = [(b"x-share-session-id", session.id.encode("utf-8"))]
            messages: list[Message] = []
            payload = WebsocketMsgCurrentAddressUpdate(
                content="/demo"
            ).model_dump_json()
            ready_event = asyncio.Event()
            gate_event = asyncio.Event()
            websocket = await _build_websocket_with_text_messages(
                messages,
                text_messages=[payload],
                headers=headers,
                message_ready_event=ready_event,
                message_gate=gate_event,
            )

            task = asyncio.create_task(
                route_websocket_share_frontend(websocket, state)
            )
            await ready_event.wait()
            threshold = get_now_timestamp()
            session.last_accessed_at = threshold - timedelta(minutes=5)
            state.share_session_store.update_session(session.id, session)
            gate_event.set()
            await task

            touched = state.share_session_store._sessions[session.id].last_accessed_at
            assert touched > threshold


class TestTerminalWebsocketRequirements:
    pytestmark = pytest.mark.asyncio

    async def test_missing_share_session_closes(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-websocket-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            state = await _build_state(root)
            messages: list[Message] = []
            websocket = await _build_websocket(messages)

            await require_share_session_id_from_websocket(websocket, state)

            assert _close_code(messages) == 4400

    async def test_unknown_share_session_closes(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-websocket-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            state = await _build_state(root)
            messages: list[Message] = []
            websocket = await _build_websocket(
                messages,
                headers=[(b"x-share-session-id", b"missing-session")],
            )

            await require_share_session_id_from_websocket(websocket, state)

            assert _close_code(messages) == 4404

    async def test_terminal_activity_touches_share_session(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-websocket-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            DBE(root).write_json(
                root / "share_policy.json",
                SharePolicy(allowRun=True).model_dump(),
            )
            state = await _build_state(root)
            state.settings_file.settings.backend.clearTerminalBeforeMarkingAsReady = (
                False
            )
            session = state.share_session_store.create_session()
            headers = [(b"x-share-session-id", session.id.encode("utf-8"))]
            section_id = create_new_id()
            terminal_id = build_terminal_id(section_id, session.id)
            ready_event = asyncio.Event()
            gate_event = asyncio.Event()
            messages: list[Message] = []
            websocket = await _build_websocket_with_text_messages(
                messages,
                text_messages=["echo test\n"],
                headers=headers,
                message_delay_seconds=0.05,
                message_ready_event=ready_event,
                message_gate=gate_event,
            )
            try:
                with runtime_context(state, session.id) as runtime_ctx:
                    task = asyncio.create_task(
                        terminal_websocket_endpoint(
                            websocket,
                            state.share_runtime_state.default_project_config_id,
                            section_id,
                            "client-keepalive",
                            runtime_ctx,
                        )
                    )

                    await ready_event.wait()
                    threshold = get_now_timestamp()
                    gate_event.set()
                    await task
            finally:
                await state.terminals.delete_terminal(terminal_id)

            touched = state.share_session_store._sessions[session.id].last_accessed_at
            assert touched > threshold
