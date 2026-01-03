import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI, HTTPException

from setta.database.db_objs import DBE
from setta.routers.artifact import (
    CheckIfFileExistsRequests,
    GetFolderContentsRequest,
    LoadCachedPathsRequest,
    route_load_cached_brush_strokes,
    route_load_cached_chart_data,
    route_load_cached_draw_area_layer_item_transform,
    route_load_cached_image_artifacts,
    route_check_if_file_exists,
    route_get_folder_contents,
)
from setta.routers.sections import (
    CreateFileRequest,
    NewJSONVersionNameRequest,
    route_create_file,
    route_new_json_version_name,
)
from setta.server_state import SettaFastAPIState
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


def _seed_share_dirs(root: Path) -> None:
    for folder in ("artifacts", "json_sources", "code"):
        (root / folder).mkdir(parents=True, exist_ok=True)


class ShareFilesystemRouteTests(unittest.IsolatedAsyncioTestCase):
    async def _build_state(self, root: Path) -> SettaFastAPIState:
        app = FastAPI()
        state = SettaFastAPIState(
            app,
            share_mode=True,
            share_deployment_root=root,
        )
        await state.wait_until_ready()
        return state

    async def test_create_file_restricts_share_paths(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-filesystem-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _seed_share_dirs(root)
            state = await self._build_state(root)

            allowed_path = root / "json_sources" / "allowed.json"
            with self.assertRaises(HTTPException) as ctx:
                route_create_file(CreateFileRequest(filepath=str(allowed_path)), state)
            self.assertEqual(403, ctx.exception.status_code)
            self.assertFalse(allowed_path.exists())

    async def test_new_json_version_name_restricts_share_paths(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-filesystem-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _seed_share_dirs(root)
            state = await self._build_state(root)

            allowed_path = root / "json_sources" / "version.json"
            with self.assertRaises(HTTPException) as ctx:
                route_new_json_version_name(
                    NewJSONVersionNameRequest(filename=str(allowed_path)),
                    state,
                )
            self.assertEqual(403, ctx.exception.status_code)

    async def test_check_if_file_exists_restricts_share_paths(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-filesystem-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _seed_share_dirs(root)
            state = await self._build_state(root)

            allowed_path = root / "code" / "run.py"
            allowed_path.write_text("print('hi')", encoding="utf-8")
            result = route_check_if_file_exists(
                CheckIfFileExistsRequests(filepath=str(allowed_path)),
                state,
            )
            self.assertTrue(result)

            blocked_path = root / "manifest.json"
            with self.assertRaises(HTTPException) as ctx:
                route_check_if_file_exists(
                    CheckIfFileExistsRequests(filepath=str(blocked_path)),
                    state,
                )
            self.assertEqual(403, ctx.exception.status_code)

    async def test_get_folder_contents_restricts_share_paths(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-filesystem-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _seed_share_dirs(root)
            state = await self._build_state(root)

            artifacts_dir = root / "artifacts"
            (artifacts_dir / "image.png").touch()
            contents = route_get_folder_contents(
                GetFolderContentsRequest(folderPath=str(artifacts_dir)),
                state,
            )
            names = {item["name"] for item in contents}
            self.assertIn("image.png", names)

            with self.assertRaises(HTTPException) as ctx:
                route_get_folder_contents(
                    GetFolderContentsRequest(folderPath=str(root)),
                    state,
                )
            self.assertEqual(403, ctx.exception.status_code)

    async def test_load_cached_image_artifacts_restricts_share_paths(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-filesystem-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _seed_share_dirs(root)
            state = await self._build_state(root)
            session = state.share_session_store.create_session()
            state.share_project_manager.create_session_state(session.id)

            image_path = root / "artifacts" / "preview.png"
            image_path.write_bytes(b"img")
            payload = LoadCachedPathsRequest(paths=[str(image_path)])
            result = route_load_cached_image_artifacts(
                payload, state, share_session_id=session.id
            )
            self.assertEqual(1, len(result))
            self.assertIsNotNone(result[0])

            blocked_payload = LoadCachedPathsRequest(paths=[str(root / "project.json")])
            with self.assertRaises(HTTPException) as ctx:
                route_load_cached_image_artifacts(
                    blocked_payload, state, share_session_id=session.id
                )
            self.assertEqual(403, ctx.exception.status_code)

    async def test_load_cached_chart_data_restricts_share_paths(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-filesystem-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _seed_share_dirs(root)
            state = await self._build_state(root)
            session = state.share_session_store.create_session()
            state.share_project_manager.create_session_state(session.id)

            chart_path = root / "artifacts" / "chart.csv"
            chart_path.write_text("x,y\n1,2\n", encoding="utf-8")
            payload = LoadCachedPathsRequest(paths=[str(chart_path)])
            result = route_load_cached_chart_data(
                payload, state, share_session_id=session.id
            )
            self.assertEqual(1, len(result))
            self.assertIsNotNone(result[0])

            blocked_payload = LoadCachedPathsRequest(paths=[str(root / "project.json")])
            with self.assertRaises(HTTPException) as ctx:
                route_load_cached_chart_data(
                    blocked_payload, state, share_session_id=session.id
                )
            self.assertEqual(403, ctx.exception.status_code)

    async def test_load_cached_brush_strokes_restricts_share_paths(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-filesystem-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _seed_share_dirs(root)
            state = await self._build_state(root)
            session = state.share_session_store.create_session()
            state.share_project_manager.create_session_state(session.id)

            stroke_path = root / "artifacts" / "stroke.json"
            stroke_payload = {
                "strokeStyle": "#000",
                "lineWidth": 1.0,
                "lineCap": "round",
                "points": [[0.0, 0.0], [1.0, 1.0]],
            }
            stroke_path.write_text(
                json.dumps(stroke_payload), encoding="utf-8"
            )
            payload = LoadCachedPathsRequest(paths=[str(stroke_path)])
            result = route_load_cached_brush_strokes(
                payload, state, share_session_id=session.id
            )
            self.assertEqual(1, len(result))
            self.assertIsNotNone(result[0])

            blocked_payload = LoadCachedPathsRequest(paths=[str(root / "project.json")])
            with self.assertRaises(HTTPException) as ctx:
                route_load_cached_brush_strokes(
                    blocked_payload, state, share_session_id=session.id
                )
            self.assertEqual(403, ctx.exception.status_code)

    async def test_load_cached_draw_area_layer_item_transform_restricts_share_paths(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-filesystem-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _seed_share_dirs(root)
            state = await self._build_state(root)
            session = state.share_session_store.create_session()
            state.share_project_manager.create_session_state(session.id)

            transform_path = root / "artifacts" / "transform.json"
            transform_payload = {
                "transform": [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
                "eraserStrokes": [],
            }
            transform_path.write_text(
                json.dumps(transform_payload), encoding="utf-8"
            )
            payload = LoadCachedPathsRequest(paths=[str(transform_path)])
            result = route_load_cached_draw_area_layer_item_transform(
                payload, state, share_session_id=session.id
            )
            self.assertEqual(1, len(result))
            self.assertIsNotNone(result[0])

            blocked_payload = LoadCachedPathsRequest(paths=[str(root / "project.json")])
            with self.assertRaises(HTTPException) as ctx:
                route_load_cached_draw_area_layer_item_transform(
                    blocked_payload, state, share_session_id=session.id
                )
            self.assertEqual(403, ctx.exception.status_code)


if __name__ == "__main__":
    unittest.main()
