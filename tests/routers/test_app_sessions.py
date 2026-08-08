from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

from fastapi import FastAPI, HTTPException, Request
import pytest
from starlette.types import Scope

from setta.database.db_objs import DBE
from setta.routers.app_deployments import (
    LoadAppProjectConfigRequest,
    route_create_app_session,
    route_get_app_deployment_state,
    route_load_app_project_config,
)
from setta.server_state import SettaFastAPIState
from setta.types.app_definition import AppDefinition
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.types.share_deployment import DeploymentManifest, DeploymentType, SharePolicy


def _write_app_project(
    deployment_root: Path,
    *,
    project_config_name: str,
    deployment_version: str,
    app_spec_payload: dict[str, Any] | None = None,
) -> ProjectConfig:
    deployment_root.mkdir(parents=True, exist_ok=True)
    dbe = DBE(deployment_root)
    project_config = ProjectConfig(name=project_config_name)
    app_spec_path = "app_specs/app.json"
    spec_payload = app_spec_payload or {"root": {"key": "root", "type": "Stack"}}
    dbe.write_json(deployment_root / app_spec_path, spec_payload)
    project_state = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        projectChatWindowingByProjectConfigId={project_config.id: {}},
        defaultProjectConfigId=project_config.id,
        appDefinition=AppDefinition(appSpecPath=app_spec_path),
    )
    dbe.write_project(project_state)
    deployment_name = deployment_root.parent.name
    manifest = DeploymentManifest(
        version=1,
        deploymentName=deployment_name,
        deploymentType=DeploymentType.app,
        defaultProjectConfigId=project_config.id,
        deploymentVersion=deployment_version,
    )
    dbe.write_json(deployment_root / "manifest.json", manifest.model_dump())
    dbe.write_json(deployment_root / "policy.json", SharePolicy().model_dump())
    return project_config


def _make_request(share_session_id: str | None) -> Request:
    headers: list[tuple[bytes, bytes]] = []
    if share_session_id is not None:
        headers.append((b"x-share-session-id", share_session_id.encode()))
    scope: Scope = {
        "type": "http",
        "http_version": "1.1",
        "scheme": "http",
        "method": "GET",
        "path": "/",
        "root_path": "",
        "query_string": b"",
        "headers": headers,
        "client": ("127.0.0.1", 8000),
        "server": ("testserver", 80),
        "path_params": {},
        "app": object(),
        "state": {},
    }

    async def empty_receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b"", "more_body": False}

    return Request(scope, empty_receive)


class TestAppSessionRoutes:
    pytestmark = pytest.mark.asyncio

    async def _build_state(self, root: Path) -> SettaFastAPIState:
        app = FastAPI()
        state = SettaFastAPIState(
            app,
            app_mode=True,
            share_deployment_root=root,
        )
        await state.wait_until_ready()
        return state

    async def test_create_session_and_fetch_state_and_config(self) -> None:
        with TemporaryDirectory() as tmpdir:
            deployments_root = Path(tmpdir) / "deployments"
            deployment_name = "app-session-test"
            deployment_version = "v1"
            deployment_root = (
                deployments_root / deployment_name / deployment_version
            )
            project_config = _write_app_project(
                deployment_root,
                project_config_name=deployment_name,
                deployment_version=deployment_version,
            )
            state = await self._build_state(deployment_root)

            session_response = await route_create_app_session(
                deployment_name,
                deployment_version,
                _make_request(None),
                state,
            )
            assert session_response.deploymentName == deployment_name
            assert session_response.deploymentVersion == deployment_version
            assert session_response.defaultProjectConfigId == project_config.id
            assert session_response.shareSessionId is not None

            request = _make_request(session_response.shareSessionId)
            state_response = await route_get_app_deployment_state(
                deployment_name,
                deployment_version,
                state,
                request,
            )
            assert state_response.projectState.projectConfig.id == project_config.id
            assert state_response.appDefinition is not None
            assert state_response.appSpec is not None

            config_response = await route_load_app_project_config(
                deployment_name,
                deployment_version,
                LoadAppProjectConfigRequest(projectConfigId=project_config.id),
                state,
                request,
            )
            assert config_response.projectState.projectConfig.id == project_config.id
            assert config_response.appDefinition is not None
            assert config_response.appSpec is not None

    async def test_state_requires_share_session_id(self) -> None:
        with TemporaryDirectory() as tmpdir:
            deployments_root = Path(tmpdir) / "deployments"
            deployment_name = "app-session-test"
            deployment_version = "v1"
            deployment_root = (
                deployments_root / deployment_name / deployment_version
            )
            _write_app_project(
                deployment_root,
                project_config_name=deployment_name,
                deployment_version=deployment_version,
            )
            state = await self._build_state(deployment_root)

            request = _make_request(None)
            with pytest.raises(HTTPException) as ctx:
                await route_get_app_deployment_state(
                    deployment_name,
                    deployment_version,
                    state,
                    request,
                )
            assert ctx.value.status_code == 400
