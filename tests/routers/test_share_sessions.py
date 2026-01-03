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
)
from setta.server_state import SettaFastAPIState
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend


def _write_share_project(root: Path) -> ProjectConfig:
    dbe = DBE(root)
    project_config = ProjectConfig(name="share-session-test")
    project_state = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        defaultProjectConfigId=project_config.id,
    )
    dbe.write_project(project_state)
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
            root = Path(tmpdir)
            project_config = _write_share_project(root)
            state = await self._build_state(root)
            deployment_id = root.name

            session_response = await route_create_share_session(deployment_id, state)
            self.assertEqual(deployment_id, session_response.deploymentId)
            self.assertEqual(
                project_config.id, session_response.projectConfigId
            )
            self.assertIsNotNone(session_response.shareSessionId)

            request = _make_request(session_response.shareSessionId)
            response = await route_get_share_deployment_state(
                deployment_id,
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
            root = Path(tmpdir)
            _write_share_project(root)
            state = await self._build_state(root)
            deployment_id = root.name

            request = _make_request(None)
            with self.assertRaises(HTTPException) as ctx:
                await route_get_share_deployment_state(
                    deployment_id,
                    state,
                    request,
                )
            self.assertEqual(400, ctx.exception.status_code)

    async def test_unknown_session_id_returns_404(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            _write_share_project(root)
            state = await self._build_state(root)
            deployment_id = root.name

            request = _make_request("missing-session")
            with self.assertRaises(HTTPException) as ctx:
                await route_get_share_deployment_state(
                    deployment_id,
                    state,
                    request,
                )
            self.assertEqual(404, ctx.exception.status_code)

    async def test_deployment_id_mismatch_returns_404(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            _write_share_project(root)
            state = await self._build_state(root)

            with self.assertRaises(HTTPException) as ctx:
                await route_create_share_session("wrong-deployment", state)
            self.assertEqual(404, ctx.exception.status_code)


if __name__ == "__main__":
    unittest.main()
