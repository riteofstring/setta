import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi import Request
from starlette.types import Scope

from setta.database.db_objs import DBE
from setta.project_state.project_manager_types import (
    ProjectStateSingleConfigWithCompletedOpIds,
)
from setta.routers.share_deployments import (
    route_create_share_session,
    route_get_share_deployment_state,
    route_get_latest_share_deployment,
    route_list_share_deployment_versions,
    route_list_share_deployments,
)
from setta.server_state import SettaFastAPIState
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.types.share_deployment import ShareDeploymentManifest


def _write_share_project(
    deployment_root: Path,
    *,
    project_config_name: str,
    deployment_version: str,
) -> ProjectConfig:
    deployment_root.mkdir(parents=True, exist_ok=True)
    dbe = DBE(deployment_root)
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
    dbe.write_json(deployment_root / "manifest.json", manifest.model_dump())
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
        "path": "/share",
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


class ShareSessionRouteTests(unittest.IsolatedAsyncioTestCase):
    async def _build_state(self, root: Path) -> SettaFastAPIState:
        app = FastAPI()
        state = SettaFastAPIState(
            app,
            share_mode=True,
            share_deployment_root=root,
        )
        await state.wait_until_ready()
        return state

    async def test_create_session_and_fetch_state(self) -> None:
        with TemporaryDirectory() as tmpdir:
            share_root = Path(tmpdir) / "share_deployments"
            project_config_name = "share-session-test"
            deployment_version = "v1"
            deployment_root = (
                share_root / project_config_name / deployment_version
            )
            project_config = _write_share_project(
                deployment_root,
                project_config_name=project_config_name,
                deployment_version=deployment_version,
            )
            state = await self._build_state(deployment_root)

            session_response = await route_create_share_session(
                project_config_name,
                deployment_version,
                state,
            )
            self.assertEqual(
                project_config_name, session_response.projectConfigName
            )
            self.assertEqual(
                deployment_version, session_response.deploymentVersion
            )
            self.assertEqual(
                project_config.id, session_response.projectConfigId
            )
            self.assertIsNotNone(session_response.shareSessionId)

            request = _make_request(session_response.shareSessionId)
            response = await route_get_share_deployment_state(
                project_config_name,
                deployment_version,
                state,
                request,
            )
            self.assertIsInstance(
                response, ProjectStateSingleConfigWithCompletedOpIds
            )
            self.assertEqual(
                project_config.id, response.projectState.projectConfig.id
            )

    async def test_state_requires_share_session_id(self) -> None:
        with TemporaryDirectory() as tmpdir:
            share_root = Path(tmpdir) / "share_deployments"
            project_config_name = "share-session-test"
            deployment_version = "v1"
            deployment_root = (
                share_root / project_config_name / deployment_version
            )
            _write_share_project(
                deployment_root,
                project_config_name=project_config_name,
                deployment_version=deployment_version,
            )
            state = await self._build_state(deployment_root)

            request = _make_request(None)
            with self.assertRaises(HTTPException) as ctx:
                await route_get_share_deployment_state(
                    project_config_name,
                    deployment_version,
                    state,
                    request,
                )
            self.assertEqual(400, ctx.exception.status_code)

    async def test_unknown_session_id_returns_404(self) -> None:
        with TemporaryDirectory() as tmpdir:
            share_root = Path(tmpdir) / "share_deployments"
            project_config_name = "share-session-test"
            deployment_version = "v1"
            deployment_root = (
                share_root / project_config_name / deployment_version
            )
            _write_share_project(
                deployment_root,
                project_config_name=project_config_name,
                deployment_version=deployment_version,
            )
            state = await self._build_state(deployment_root)

            request = _make_request("missing-session")
            with self.assertRaises(HTTPException) as ctx:
                await route_get_share_deployment_state(
                    project_config_name,
                    deployment_version,
                    state,
                    request,
                )
            self.assertEqual(404, ctx.exception.status_code)

    async def test_deployment_mismatch_returns_404(self) -> None:
        with TemporaryDirectory() as tmpdir:
            share_root = Path(tmpdir) / "share_deployments"
            project_config_name = "share-session-test"
            deployment_version = "v1"
            deployment_root = (
                share_root / project_config_name / deployment_version
            )
            _write_share_project(
                deployment_root,
                project_config_name=project_config_name,
                deployment_version=deployment_version,
            )
            state = await self._build_state(deployment_root)

            with self.assertRaises(HTTPException) as ctx:
                await route_create_share_session(
                    "wrong-config",
                    deployment_version,
                    state,
                )
            self.assertEqual(404, ctx.exception.status_code)

    async def test_share_mode_blocks_deployment_lists(self) -> None:
        with TemporaryDirectory() as tmpdir:
            share_root = Path(tmpdir) / "share_deployments"
            project_config_name = "share-session-test"
            deployment_version = "v1"
            deployment_root = (
                share_root / project_config_name / deployment_version
            )
            _write_share_project(
                deployment_root,
                project_config_name=project_config_name,
                deployment_version=deployment_version,
            )
            state = await self._build_state(deployment_root)

            with self.assertRaises(HTTPException) as ctx:
                route_list_share_deployments(state)
            self.assertEqual(403, ctx.exception.status_code)

            with self.assertRaises(HTTPException) as ctx:
                route_list_share_deployment_versions(project_config_name, state)
            self.assertEqual(403, ctx.exception.status_code)

    async def test_share_mode_latest_redacts_paths(self) -> None:
        with TemporaryDirectory() as tmpdir:
            share_root = Path(tmpdir) / "share_deployments"
            project_config_name = "share-session-test"
            deployment_version = "v1"
            deployment_root = (
                share_root / project_config_name / deployment_version
            )
            _write_share_project(
                deployment_root,
                project_config_name=project_config_name,
                deployment_version=deployment_version,
            )
            state = await self._build_state(deployment_root)

            latest = route_get_latest_share_deployment(project_config_name, state)
            self.assertEqual(project_config_name, latest.projectConfigName)
            self.assertEqual(Path("redacted"), latest.deploymentRoot)
            self.assertEqual(Path("redacted"), latest.sharePolicyPath)


if __name__ == "__main__":
    unittest.main()
