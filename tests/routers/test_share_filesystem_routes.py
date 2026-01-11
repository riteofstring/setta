import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI, HTTPException

from setta.database.db_objs import DBE
from setta.database.utils import create_new_id
from setta.project_state.project_manager_types import (
    DeleteJSONSourceFileAndVariantRequest,
    DeleteSectionVariantOrAskRequest,
)
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
from setta.routers.project_manager import (
    route_delete_json_source_file_and_variant,
    route_delete_section_variant_or_ask,
)
from setta.routers.sections import (
    CreateFileRequest,
    GetJSONSourcePathToBeDeleted,
    NewJSONVersionNameRequest,
    route_create_file,
    route_get_json_source_path_to_be_deleted,
    route_new_json_version_name,
)
from setta.server_state import SettaFastAPIState
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
            session = state.share_session_store.create_session()
            session = state.share_session_store.create_session()

            allowed_path = root / "json_sources" / "allowed.json"
            with self.assertRaises(HTTPException) as ctx:
                with runtime_context(state, session.id) as runtime_ctx:
                    route_create_file(
                        CreateFileRequest(filepath=str(allowed_path)),
                        runtime_ctx,
                    )
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
            session = state.share_session_store.create_session()

            allowed_path = root / "json_sources" / "version.json"
            with self.assertRaises(HTTPException) as ctx:
                with runtime_context(state, session.id) as runtime_ctx:
                    route_new_json_version_name(
                        NewJSONVersionNameRequest(filename=str(allowed_path)),
                        runtime_ctx,
                    )
            self.assertEqual(403, ctx.exception.status_code)

    async def test_get_json_source_path_to_be_deleted_restricts_share_paths(
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

            with self.assertRaises(HTTPException) as ctx:
                with runtime_context(state, session.id) as runtime_ctx:
                    route_get_json_source_path_to_be_deleted(
                        GetJSONSourcePathToBeDeleted(variantName="data.json"),
                        runtime_ctx,
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
            session = state.share_session_store.create_session()

            allowed_path = root / "code" / "run.py"
            allowed_path.write_text("print('hi')", encoding="utf-8")
            with runtime_context(state, session.id) as runtime_ctx:
                result = route_check_if_file_exists(
                    CheckIfFileExistsRequests(filepath=str(allowed_path)),
                    runtime_ctx,
                )
            self.assertTrue(result)

            blocked_path = root / "manifest.json"
            with self.assertRaises(HTTPException) as ctx:
                with runtime_context(state, session.id) as runtime_ctx:
                    route_check_if_file_exists(
                        CheckIfFileExistsRequests(filepath=str(blocked_path)),
                        runtime_ctx,
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
            session = state.share_session_store.create_session()

            artifacts_dir = root / "artifacts"
            (artifacts_dir / "image.png").touch()
            with runtime_context(state, session.id) as runtime_ctx:
                contents = route_get_folder_contents(
                    GetFolderContentsRequest(folderPath=str(artifacts_dir)),
                    runtime_ctx,
                )
            names = {item["name"] for item in contents}
            self.assertIn("image.png", names)

            with self.assertRaises(HTTPException) as ctx:
                with runtime_context(state, session.id) as runtime_ctx:
                    route_get_folder_contents(
                        GetFolderContentsRequest(folderPath=str(root)),
                        runtime_ctx,
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
            state.share_runtime_state.create_session_backend(session.id)

            image_path = root / "artifacts" / "preview.png"
            image_path.write_bytes(b"img")
            payload = LoadCachedPathsRequest(paths=[str(image_path)])
            with runtime_context(state, session.id) as runtime_ctx:
                result = route_load_cached_image_artifacts(payload, runtime_ctx)
            self.assertEqual(1, len(result))
            self.assertIsNotNone(result[0])

    async def test_delete_section_variant_blocked_in_share_mode(self) -> None:
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
            request = DeleteSectionVariantOrAskRequest(
                projectConfigId=create_new_id(),
                sectionId=create_new_id(),
                variantId=create_new_id(),
            )

            with self.assertRaises(HTTPException) as ctx:
                session = state.share_session_store.create_session()
                with runtime_context(state, session.id) as runtime_ctx:
                    await route_delete_section_variant_or_ask(request, runtime_ctx)

            self.assertEqual(403, ctx.exception.status_code)

    async def test_delete_json_source_variant_blocked_in_share_mode(self) -> None:
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
            request = DeleteJSONSourceFileAndVariantRequest(
                projectConfigId=create_new_id(),
                sectionId=create_new_id(),
                variantId=create_new_id(),
                filepath="some-file.json",
            )

            with self.assertRaises(HTTPException) as ctx:
                session = state.share_session_store.create_session()
                with runtime_context(state, session.id) as runtime_ctx:
                    await route_delete_json_source_file_and_variant(
                        request,
                        runtime_ctx,
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
            state.share_runtime_state.create_session_backend(session.id)

            chart_path = root / "artifacts" / "chart.csv"
            chart_path.write_text("x,y\n1,2\n", encoding="utf-8")
            payload = LoadCachedPathsRequest(paths=[str(chart_path)])
            with runtime_context(state, session.id) as runtime_ctx:
                result = route_load_cached_chart_data(payload, runtime_ctx)
            self.assertEqual(1, len(result))
            self.assertIsNotNone(result[0])

            blocked_payload = LoadCachedPathsRequest(paths=[str(root / "project.json")])
            with self.assertRaises(HTTPException) as ctx:
                with runtime_context(state, session.id) as runtime_ctx:
                    route_load_cached_chart_data(blocked_payload, runtime_ctx)
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
            state.share_runtime_state.create_session_backend(session.id)

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
            with runtime_context(state, session.id) as runtime_ctx:
                result = route_load_cached_brush_strokes(payload, runtime_ctx)
            self.assertEqual(1, len(result))
            self.assertIsNotNone(result[0])

            blocked_payload = LoadCachedPathsRequest(paths=[str(root / "project.json")])
            with self.assertRaises(HTTPException) as ctx:
                with runtime_context(state, session.id) as runtime_ctx:
                    route_load_cached_brush_strokes(blocked_payload, runtime_ctx)
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
            state.share_runtime_state.create_session_backend(session.id)

            transform_path = root / "artifacts" / "transform.json"
            transform_payload = {
                "transform": [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
                "eraserStrokes": [],
            }
            transform_path.write_text(
                json.dumps(transform_payload), encoding="utf-8"
            )
            payload = LoadCachedPathsRequest(paths=[str(transform_path)])
            with runtime_context(state, session.id) as runtime_ctx:
                result = route_load_cached_draw_area_layer_item_transform(
                    payload, runtime_ctx
                )
            self.assertEqual(1, len(result))
            self.assertIsNotNone(result[0])

            blocked_payload = LoadCachedPathsRequest(paths=[str(root / "project.json")])
            with self.assertRaises(HTTPException) as ctx:
                with runtime_context(state, session.id) as runtime_ctx:
                    route_load_cached_draw_area_layer_item_transform(
                        blocked_payload,
                        runtime_ctx,
                    )
            self.assertEqual(403, ctx.exception.status_code)


if __name__ == "__main__":
    unittest.main()
