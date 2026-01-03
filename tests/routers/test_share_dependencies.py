import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any
from datetime import timedelta

from fastapi import FastAPI, HTTPException, Request, WebSocket
from starlette.types import Scope

from setta.routers.dependencies import (
    get_share_session_id_from_request,
    get_share_session_id_from_websocket,
    share_session_context_from_request,
)
from setta.server_state import SettaFastAPIState
from setta.database.db_objs import DBE
from setta.share.session_context import get_share_session_id
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.types.share_deployment import ShareDeploymentManifest


def _make_request(
    *,
    path: str = "/share",
    headers: list[tuple[bytes, bytes]] | None = None,
    query_string: str | None = None,
) -> Request:
    scope: Scope = {
        "type": "http",
        "http_version": "1.1",
        "scheme": "http",
        "method": "GET",
        "path": path,
        "root_path": "",
        "query_string": query_string.encode() if query_string else b"",
        "headers": headers or [],
        "client": ("127.0.0.1", 8000),
        "server": ("testserver", 80),
        "path_params": {},
        "app": object(),
        "state": {},
    }

    async def empty_receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b"", "more_body": False}

    return Request(scope, empty_receive)


def _make_websocket(
    *,
    path: str = "/share",
    headers: list[tuple[bytes, bytes]] | None = None,
    query_string: str | None = None,
) -> WebSocket:
    scope: Scope = {
        "type": "websocket",
        "path": path,
        "query_string": query_string.encode() if query_string else b"",
        "scheme": "ws",
        "headers": headers or [],
        "client": ("127.0.0.1", 9000),
        "server": ("testserver", 80),
        "subprotocols": [],
        "extensions": {},
        "state": {},
        "path_params": {},
        "app": object(),
    }

    async def empty_receive() -> dict[str, Any]:
        return {
            "type": "websocket.receive",
            "bytes": b"",
            "text": "",
            "more_body": False,
        }

    async def empty_send(_message: dict[str, Any]) -> None:
        return None

    return WebSocket(scope, empty_receive, empty_send)


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
) -> ProjectConfig:
    dbe = DBE(root)
    project_config = ProjectConfig(name=project_config_name)
    project_state = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        defaultProjectConfigId=project_config.id,
    )
    dbe.write_project(project_state)
    manifest = ShareDeploymentManifest(
        version=1,
        projectConfigId=project_config.id,
        projectConfigName=project_config.name,
        deploymentVersion=deployment_version,
    )
    dbe.write_json(root / "manifest.json", manifest.model_dump())
    return project_config


def _make_app_request(
    app: FastAPI,
    *,
    path: str = "/share",
    headers: list[tuple[bytes, bytes]] | None = None,
    query_string: str | None = None,
) -> Request:
    scope: Scope = {
        "type": "http",
        "http_version": "1.1",
        "scheme": "http",
        "method": "GET",
        "path": path,
        "root_path": "",
        "query_string": query_string.encode() if query_string else b"",
        "headers": headers or [],
        "client": ("127.0.0.1", 8000),
        "server": ("testserver", 80),
        "path_params": {},
        "app": app,
        "state": {},
    }

    async def empty_receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b"", "more_body": False}

    return Request(scope, empty_receive)


class ShareDependencyTests(unittest.TestCase):
    def test_request_header_precedence(self) -> None:
        request = _make_request(
            headers=[
                (b"x-share-session-id", b"header"),
                (b"cookie", b"shareSessionId=cookie"),
            ],
            query_string="shareSessionId=query",
        )
        self.assertEqual("header", get_share_session_id_from_request(request))

    def test_request_cookie_fallback(self) -> None:
        request = _make_request(
            headers=[(b"cookie", b"shareSessionId=cookie")],
            query_string="shareSessionId=query",
        )
        self.assertEqual("cookie", get_share_session_id_from_request(request))

    def test_request_query_fallback(self) -> None:
        request = _make_request(query_string="shareSessionId=query")
        self.assertEqual("query", get_share_session_id_from_request(request))

    def test_request_missing_session_id_raises(self) -> None:
        request = _make_request()
        with self.assertRaises(KeyError):
            get_share_session_id_from_request(request)

    def test_websocket_header_precedence(self) -> None:
        websocket = _make_websocket(
            headers=[
                (b"x-share-session-id", b"header"),
                (b"cookie", b"shareSessionId=cookie"),
            ],
            query_string="shareSessionId=query",
        )
        self.assertEqual("header", get_share_session_id_from_websocket(websocket))

    def test_websocket_cookie_fallback(self) -> None:
        websocket = _make_websocket(
            headers=[(b"cookie", b"shareSessionId=cookie")],
            query_string="shareSessionId=query",
        )
        self.assertEqual("cookie", get_share_session_id_from_websocket(websocket))

    def test_websocket_query_fallback(self) -> None:
        websocket = _make_websocket(query_string="shareSessionId=query")
        self.assertEqual("query", get_share_session_id_from_websocket(websocket))

    def test_websocket_missing_session_id_raises(self) -> None:
        websocket = _make_websocket()
        with self.assertRaises(KeyError):
            get_share_session_id_from_websocket(websocket)


class ShareSessionContextTests(unittest.IsolatedAsyncioTestCase):
    async def _build_state(self, root: Path) -> tuple[FastAPI, SettaFastAPIState]:
        app = FastAPI()
        state = SettaFastAPIState(
            app,
            share_mode=True,
            share_deployment_root=root,
        )
        app.state.setta = state
        await state.wait_until_ready()
        return app, state

    async def test_share_session_context_sets_and_resets(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-dependency-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            app, state = await self._build_state(root)
            session = state.share_session_store.create_session()
            request = _make_app_request(
                app,
                headers=[(b"x-share-session-id", session.id.encode())],
            )
            self.assertIsNone(get_share_session_id())

            context = share_session_context_from_request(request)
            try:
                session_id = await context.__anext__()
                self.assertEqual(session.id, session_id)
                self.assertEqual(session.id, get_share_session_id())
            finally:
                await context.aclose()

            self.assertIsNone(get_share_session_id())

    async def test_share_session_context_requires_session_id(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-dependency-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            app, _state = await self._build_state(root)
            request = _make_app_request(app)
            context = share_session_context_from_request(request)
            try:
                with self.assertRaises(HTTPException) as ctx:
                    await context.__anext__()
                self.assertEqual(400, ctx.exception.status_code)
            finally:
                await context.aclose()

    async def test_share_session_context_touches_session(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-dependency-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            app, state = await self._build_state(root)
            session = state.share_session_store.create_session()
            old_timestamp = session.last_accessed_at - timedelta(seconds=120)
            session.last_accessed_at = old_timestamp
            request = _make_app_request(
                app,
                headers=[(b"x-share-session-id", session.id.encode())],
            )
            context = share_session_context_from_request(request)
            try:
                await context.__anext__()
            finally:
                await context.aclose()

            self.assertGreater(session.last_accessed_at, old_timestamp)


if __name__ == "__main__":
    unittest.main()
