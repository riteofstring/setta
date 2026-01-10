import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI, HTTPException

from setta.database.db_objs import DBE
from setta.routers.dependencies import require_ide_mode
from setta.routers.settings import SaveSettingsRequest, route_save_settings
from setta.server_state import SettaFastAPIState
from setta.types.generated.settings_state import SettingsState
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.types.share_deployment import ShareDeploymentManifest
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


class ShareModeIdeRouteTests(unittest.IsolatedAsyncioTestCase):
    async def _build_state(self, root: Path) -> SettaFastAPIState:
        app = FastAPI()
        state = SettaFastAPIState(
            app,
            share_mode=True,
            share_deployment_root=root,
        )
        await state.wait_until_ready()
        return state

    async def test_share_mode_blocks_settings_save(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-ide-block-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            state = await self._build_state(root)
            session = state.share_session_store.create_session()

            with self.assertRaises(HTTPException) as ctx:
                with runtime_context(state, session.id) as runtime_ctx:
                    await route_save_settings(
                        SaveSettingsRequest(settings=SettingsState()),
                        runtime_ctx,
                    )
            self.assertEqual(403, ctx.exception.status_code)

    async def test_require_ide_mode_rejects_share_state(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-ide-block-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            state = await self._build_state(root)

            with self.assertRaises(HTTPException) as ctx:
                require_ide_mode(state)
            self.assertEqual(403, ctx.exception.status_code)
