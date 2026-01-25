import os
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from fastapi import FastAPI, HTTPException

from setta.database.db_objs import DBE
from setta.lsp.managers import stop_file_watcher, stop_lsps
from setta.routers.artifact import (
    GetFolderContentsRequest,
    route_get_file_browser_root,
    route_get_folder_contents,
)
from setta.server_state import SettaFastAPIState
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.types.share_deployment import ShareDeploymentManifest
from setta.utils.constants import C, CWD
from tests.utils.runtime_context import runtime_context
from tests.utils.manager_fixture import _seed_minimal_setta_files


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


async def _shutdown_state(state: SettaFastAPIState) -> None:
    if state.specific_file_watcher:
        state.specific_file_watcher.stop()
    if not state.mcp_client.disabled:
        await state.mcp_client.stop()
    if state.lsps and state.lsp_readers:
        await stop_lsps(state.lsps, state.lsp_readers)
    if state.lsp_writers:
        stop_file_watcher(state.lsp_writers)


class FileBrowserRouteTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self._states: list[SettaFastAPIState] = []
        self._patchers: list[patch] = []
        self._temp_dirs: list[TemporaryDirectory] = []

    async def asyncTearDown(self) -> None:
        for state in self._states:
            await _shutdown_state(state)
        for patcher in reversed(self._patchers):
            patcher.stop()
        for temp_dir in self._temp_dirs:
            temp_dir.cleanup()

    async def _build_state(
        self,
        *,
        share_mode: bool = False,
        share_deployment_root: Path | None = None,
    ) -> SettaFastAPIState:
        if not share_mode:
            temp_dir = TemporaryDirectory()
            self._temp_dirs.append(temp_dir)
            setta_root = Path(temp_dir.name) / "setta_files"
            _seed_minimal_setta_files(setta_root)
            code_folder = setta_root / "code"
            artifacts_folder = setta_root / "artifacts"
            backup_folder = setta_root / "backups"
            run_folder = setta_root / "run"
            run_sessions_folder = run_folder / "sessions"
            run_logs_folder = run_folder / "logs"
            share_deployments_folder = setta_root / "share_deployments"
            for path in (
                code_folder,
                artifacts_folder,
                backup_folder,
                run_sessions_folder,
                run_logs_folder,
                share_deployments_folder,
            ):
                path.mkdir(parents=True, exist_ok=True)
            patchers = [
                patch.object(C, "SETTA_FILES_FOLDER", setta_root),
                patch.object(C, "CODE_FOLDER", code_folder),
                patch.object(C, "ARTIFACTS_FOLDER", artifacts_folder),
                patch.object(C, "DB_BACKUP_FOLDER", backup_folder),
                patch.object(C, "RUN_FOLDER", run_folder),
                patch.object(C, "RUN_SESSIONS_FOLDER", run_sessions_folder),
                patch.object(C, "RUN_LOGS_FOLDER", run_logs_folder),
                patch.object(C, "SHARE_DEPLOYMENTS_FOLDER", share_deployments_folder),
            ]
            for patcher in patchers:
                patcher.start()
            self._patchers.extend(patchers)
        app = FastAPI()
        state = SettaFastAPIState(
            app,
            share_mode=share_mode,
            share_deployment_root=share_deployment_root,
            enable_mcp_connections=False,
            enable_language_server=False,
        )
        self._states.append(state)
        await state.wait_until_ready()
        return state

    async def test_get_file_browser_root_ide_mode(self) -> None:
        state = await self._build_state()
        with runtime_context(state) as runtime_ctx:
            response = route_get_file_browser_root(runtime_ctx)
        self.assertEqual(str(CWD.resolve()), response.rootPath)
        self.assertEqual(os.sep, response.pathSeparator)
        self.assertIn(".git", response.ignorePatterns)

    async def test_get_file_browser_root_share_mode_forbidden(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-file-browser-root"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            state = await self._build_state(
                share_mode=True,
                share_deployment_root=root,
            )
            session = state.share_session_store.create_session()
            with runtime_context(state, session.id) as runtime_ctx:
                with self.assertRaises(HTTPException) as ctx:
                    route_get_file_browser_root(runtime_ctx)
        self.assertEqual(403, ctx.exception.status_code)

    async def test_get_folder_contents_share_mode_forbidden(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-file-browser-folder"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            state = await self._build_state(
                share_mode=True,
                share_deployment_root=root,
            )
            session = state.share_session_store.create_session()
            with runtime_context(state, session.id) as runtime_ctx:
                with self.assertRaises(HTTPException) as ctx:
                    route_get_folder_contents(
                        GetFolderContentsRequest(folderPath=str(root)),
                        runtime_ctx,
                    )
        self.assertEqual(403, ctx.exception.status_code)

    async def test_get_folder_contents_filters_hidden_and_ignored(self) -> None:
        state = await self._build_state()
        with TemporaryDirectory(dir=CWD) as tmpdir:
            root_path = Path(tmpdir)
            (root_path / "visible.txt").write_text("hello", encoding="utf-8")
            (root_path / "child").mkdir()
            (root_path / "node_modules").mkdir()
            (root_path / ".env").write_text("hidden", encoding="utf-8")
            with runtime_context(state) as runtime_ctx:
                items = route_get_folder_contents(
                    GetFolderContentsRequest(folderPath=str(root_path)),
                    runtime_ctx,
                )
        names = {item["name"] for item in items}
        self.assertIn("visible.txt", names)
        self.assertIn("child", names)
        self.assertNotIn("node_modules", names)
        self.assertNotIn(".env", names)

    async def test_get_folder_contents_include_hidden_and_ignore_override(self) -> None:
        state = await self._build_state()
        with TemporaryDirectory(dir=CWD) as tmpdir:
            root_path = Path(tmpdir)
            (root_path / ".env").write_text("hidden", encoding="utf-8")
            (root_path / "node_modules").mkdir()
            with runtime_context(state) as runtime_ctx:
                items = route_get_folder_contents(
                    GetFolderContentsRequest(
                        folderPath=str(root_path),
                        includeHidden=True,
                        ignorePatterns=[],
                        includeMtime=True,
                        includeSize=True,
                    ),
                    runtime_ctx,
                )
        names = {item["name"] for item in items}
        self.assertIn(".env", names)
        self.assertIn("node_modules", names)
        for item in items:
            self.assertIn("fullPath", item)
            self.assertIn("mtime", item)
            self.assertIn("size", item)

    async def test_get_folder_contents_full_path_and_max_entries(self) -> None:
        state = await self._build_state()
        with TemporaryDirectory(dir=CWD) as tmpdir:
            root_path = Path(tmpdir)
            (root_path / "a.txt").write_text("a", encoding="utf-8")
            (root_path / "b.txt").write_text("b", encoding="utf-8")
            (root_path / "c.txt").write_text("c", encoding="utf-8")
            with runtime_context(state) as runtime_ctx:
                items = route_get_folder_contents(
                    GetFolderContentsRequest(
                        folderPath=str(root_path),
                        maxEntries=1,
                    ),
                    runtime_ctx,
                )
        self.assertEqual(1, len(items))
        expected_path = (root_path / items[0]["name"]).resolve()
        self.assertEqual(expected_path, Path(items[0]["fullPath"]).resolve())

    async def test_get_folder_contents_blocks_outside_cwd(self) -> None:
        state = await self._build_state()
        with TemporaryDirectory() as tmpdir:
            with runtime_context(state) as runtime_ctx:
                with self.assertRaises(HTTPException) as ctx:
                    route_get_folder_contents(
                        GetFolderContentsRequest(folderPath=tmpdir),
                        runtime_ctx,
                    )
        self.assertEqual(403, ctx.exception.status_code)

    async def test_get_folder_contents_errors(self) -> None:
        state = await self._build_state()
        with TemporaryDirectory(dir=CWD) as tmpdir:
            root_path = Path(tmpdir)
            file_path = root_path / "file.txt"
            file_path.write_text("hi", encoding="utf-8")
            missing_path = root_path / "missing"
            with runtime_context(state) as runtime_ctx:
                with self.assertRaises(FileNotFoundError):
                    route_get_folder_contents(
                        GetFolderContentsRequest(folderPath=str(missing_path)),
                        runtime_ctx,
                    )
                with self.assertRaises(NotADirectoryError):
                    route_get_folder_contents(
                        GetFolderContentsRequest(folderPath=str(file_path)),
                        runtime_ctx,
                    )


if __name__ == "__main__":
    unittest.main()
