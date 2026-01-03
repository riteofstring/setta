import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI

from setta.database.db_objs import DBE
from setta.routers.artifact import UpdateArtifactsRequest, route_update_artifacts
from setta.server_state import SettaFastAPIState
from setta.types.artifact import BrushStroke, BrushStrokeArtifact, DrawAreaBrushShape
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.types.share_deployment import ShareDeploymentManifest


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
    manifest = ShareDeploymentManifest(
        version=1,
        projectConfigId=project_config.id,
        projectConfigName=project_config.name,
        deploymentVersion=deployment_version,
    )
    dbe.write_json(root / "manifest.json", manifest.model_dump())


class ShareArtifactRouteTests(unittest.IsolatedAsyncioTestCase):
    async def _build_state(self, root: Path) -> SettaFastAPIState:
        app = FastAPI()
        state = SettaFastAPIState(
            app,
            share_mode=True,
            share_deployment_root=root,
        )
        await state.wait_until_ready()
        return state

    async def test_share_updates_are_in_memory_only(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-artifacts-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            state = await self._build_state(root)
            session = state.share_session_store.create_session()

            artifact_path = root / "artifacts" / "stroke.json"
            artifact = BrushStrokeArtifact(
                id=str(artifact_path),
                value=BrushStroke(
                    strokeStyle="#000000",
                    lineWidth=2.0,
                    lineCap=DrawAreaBrushShape.butt,
                ),
            )
            request = UpdateArtifactsRequest(artifacts=[artifact])

            results = await route_update_artifacts(request, state, session.id)

            self.assertEqual(1, len(results))
            self.assertEqual("saved", results[0].status)
            self.assertFalse(artifact_path.exists())

            cached = state.share_project_manager.get_session_artifacts(
                session.id
            ).get_cached_brush_stroke(artifact_path)
            self.assertIsNotNone(cached)


if __name__ == "__main__":
    unittest.main()
