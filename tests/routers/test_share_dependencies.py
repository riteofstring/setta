from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any
from datetime import timedelta

from fastapi import FastAPI, HTTPException, Request
import pytest
from starlette.types import Scope

from setta.routers.dependencies import (
    get_runtime_context_from_request,
    maybe_get_share_session_id_from_request,
)
from setta.server_state import SettaFastAPIState
from setta.database.db_objs import DBE
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.types.share_deployment import DeploymentManifest, DeploymentType


def _make_request(
    *,
    path: str = "/",
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


def _build_share_deployment_root(
    tmpdir: str,
    project_config_name: str,
    deployment_version: str = "v1",
) -> Path:
    root = (
        Path(tmpdir)
        / "deployments"
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
    deployment_name = root.parent.name
    manifest = DeploymentManifest(
        version=1,
        deploymentName=deployment_name,
        deploymentType=DeploymentType.share,
        defaultProjectConfigId=project_config.id,
        deploymentVersion=deployment_version,
    )
    dbe.write_json(root / "manifest.json", manifest.model_dump())
    return project_config


def _make_app_request(
    app: FastAPI,
    *,
    path: str = "/",
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


def test_request_header_precedence() -> None:
    request = _make_request(
        headers=[
            (b"x-share-session-id", b"header"),
            (b"cookie", b"shareSessionId=cookie"),
        ],
        query_string="shareSessionId=query",
    )
    assert maybe_get_share_session_id_from_request(request) == "header"


def test_request_cookie_fallback() -> None:
    request = _make_request(
        headers=[(b"cookie", b"shareSessionId=cookie")],
        query_string="shareSessionId=query",
    )
    assert maybe_get_share_session_id_from_request(request) == "cookie"


def test_request_query_fallback() -> None:
    request = _make_request(query_string="shareSessionId=query")
    assert maybe_get_share_session_id_from_request(request) == "query"


def test_request_missing_session_id_returns_none() -> None:
    request = _make_request()
    assert maybe_get_share_session_id_from_request(request) is None


async def _build_state(root: Path) -> tuple[FastAPI, SettaFastAPIState]:
    app = FastAPI()
    state = SettaFastAPIState(
        app,
        share_mode=True,
        share_deployment_root=root,
    )
    app.state.setta = state
    await state.wait_until_ready()
    return app, state


@pytest.mark.asyncio
async def test_runtime_context_exposes_session_id() -> None:
    with TemporaryDirectory() as tmpdir:
        project_config_name = "share-dependency-test"
        root = _build_share_deployment_root(tmpdir, project_config_name)
        _write_share_project(
            root,
            project_config_name=project_config_name,
            deployment_version=root.name,
        )
        app, state = await _build_state(root)
        session = state.share_session_store.create_session()
        request = _make_app_request(
            app,
            headers=[(b"x-share-session-id", session.id.encode())],
        )
        context = get_runtime_context_from_request(request)
        try:
            runtime_ctx = await context.__anext__()
            assert runtime_ctx.share_session_id == session.id
        finally:
            await context.aclose()


@pytest.mark.asyncio
async def test_share_session_context_requires_session_id() -> None:
    with TemporaryDirectory() as tmpdir:
        project_config_name = "share-dependency-test"
        root = _build_share_deployment_root(tmpdir, project_config_name)
        _write_share_project(
            root,
            project_config_name=project_config_name,
            deployment_version=root.name,
        )
        app, _state = await _build_state(root)
        request = _make_app_request(app)
        context = get_runtime_context_from_request(request)
        try:
            with pytest.raises(HTTPException) as exc:
                await context.__anext__()
            assert exc.value.status_code == 400
        finally:
            await context.aclose()


@pytest.mark.asyncio
async def test_share_session_context_touches_session() -> None:
    with TemporaryDirectory() as tmpdir:
        project_config_name = "share-dependency-test"
        root = _build_share_deployment_root(tmpdir, project_config_name)
        _write_share_project(
            root,
            project_config_name=project_config_name,
            deployment_version=root.name,
        )
        app, state = await _build_state(root)
        session = state.share_session_store.create_session()
        old_timestamp = session.last_accessed_at - timedelta(seconds=120)
        session.last_accessed_at = old_timestamp
        request = _make_app_request(
            app,
            headers=[(b"x-share-session-id", session.id.encode())],
        )
        context = get_runtime_context_from_request(request)
        try:
            await context.__anext__()
        finally:
            await context.aclose()

        assert session.last_accessed_at > old_timestamp
