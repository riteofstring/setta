import base64
import os
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI, HTTPException
import pytest
import pytest_asyncio

import setta.routers.artifact as artifact_router
from setta.database.db_objs import DBE
from setta.lsp.managers import stop_file_watcher, stop_lsps
from setta.routers.artifact import (
    DeleteArtifactRequestItem,
    DeleteArtifactsRequest,
    GetFolderContentsRequest,
    ImportFilesToArtifactsRequest,
    UpdateArtifactsRequest,
    route_delete_artifacts,
    route_get_file_browser_root,
    route_get_folder_contents,
    route_import_files_to_artifacts,
    route_update_artifacts,
)
from setta.server_state import SettaFastAPIState
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.types.share_deployment import ShareDeploymentManifest
from setta.types.artifact import ArtifactType, FileArtifact
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


def _set_temp_constants(root: Path) -> dict[str, Path]:
    previous = {
        "SETTA_FILES_FOLDER": C.SETTA_FILES_FOLDER,
        "CODE_FOLDER": C.CODE_FOLDER,
        "DB_BACKUP_FOLDER": C.DB_BACKUP_FOLDER,
        "ARTIFACTS_FOLDER": C.ARTIFACTS_FOLDER,
        "RUN_FOLDER": C.RUN_FOLDER,
        "RUN_SESSIONS_FOLDER": C.RUN_SESSIONS_FOLDER,
        "RUN_LOGS_FOLDER": C.RUN_LOGS_FOLDER,
        "SHARE_DEPLOYMENTS_FOLDER": C.SHARE_DEPLOYMENTS_FOLDER,
    }
    C.SETTA_FILES_FOLDER = root / "setta_files"
    C.CODE_FOLDER = C.SETTA_FILES_FOLDER / "code"
    C.DB_BACKUP_FOLDER = C.SETTA_FILES_FOLDER / "backups"
    C.ARTIFACTS_FOLDER = C.SETTA_FILES_FOLDER / "artifacts"
    C.RUN_FOLDER = C.SETTA_FILES_FOLDER / "run"
    C.RUN_SESSIONS_FOLDER = C.RUN_FOLDER / "sessions"
    C.RUN_LOGS_FOLDER = C.RUN_FOLDER / "logs"
    C.SHARE_DEPLOYMENTS_FOLDER = C.SETTA_FILES_FOLDER / "share_deployments"
    for path in (
        C.SETTA_FILES_FOLDER,
        C.CODE_FOLDER,
        C.DB_BACKUP_FOLDER,
        C.ARTIFACTS_FOLDER,
        C.RUN_FOLDER,
        C.RUN_SESSIONS_FOLDER,
        C.RUN_LOGS_FOLDER,
        C.SHARE_DEPLOYMENTS_FOLDER,
    ):
        path.mkdir(parents=True, exist_ok=True)
    _seed_minimal_setta_files(C.SETTA_FILES_FOLDER)
    return previous


def _restore_constants(previous: dict[str, Path]) -> None:
    C.SETTA_FILES_FOLDER = previous["SETTA_FILES_FOLDER"]
    C.CODE_FOLDER = previous["CODE_FOLDER"]
    C.DB_BACKUP_FOLDER = previous["DB_BACKUP_FOLDER"]
    C.ARTIFACTS_FOLDER = previous["ARTIFACTS_FOLDER"]
    C.RUN_FOLDER = previous["RUN_FOLDER"]
    C.RUN_SESSIONS_FOLDER = previous["RUN_SESSIONS_FOLDER"]
    C.RUN_LOGS_FOLDER = previous["RUN_LOGS_FOLDER"]
    C.SHARE_DEPLOYMENTS_FOLDER = previous["SHARE_DEPLOYMENTS_FOLDER"]


class TestFileBrowserRoutes:
    pytestmark = pytest.mark.asyncio

    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self):
        self._states: list[SettaFastAPIState] = []
        self._temp_dirs: list[TemporaryDirectory] = []
        self._temp_dir = TemporaryDirectory()
        self._previous_constants = _set_temp_constants(Path(self._temp_dir.name))
        try:
            yield
        finally:
            for state in self._states:
                await _shutdown_state(state)
            for temp_dir in self._temp_dirs:
                temp_dir.cleanup()
            _restore_constants(self._previous_constants)
            self._temp_dir.cleanup()

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
            C.SETTA_FILES_FOLDER = setta_root
            C.CODE_FOLDER = code_folder
            C.ARTIFACTS_FOLDER = artifacts_folder
            C.DB_BACKUP_FOLDER = backup_folder
            C.RUN_FOLDER = run_folder
            C.RUN_SESSIONS_FOLDER = run_sessions_folder
            C.RUN_LOGS_FOLDER = run_logs_folder
            C.SHARE_DEPLOYMENTS_FOLDER = share_deployments_folder
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
        assert str(CWD.resolve()) == response.rootPath
        assert os.sep == response.pathSeparator
        assert ".git" in response.ignorePatterns

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
                with pytest.raises(HTTPException) as ctx:
                    route_get_file_browser_root(runtime_ctx)
        assert ctx.value.status_code == 403

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
                with pytest.raises(HTTPException) as ctx:
                    route_get_folder_contents(
                        GetFolderContentsRequest(folderPath=str(root)),
                        runtime_ctx,
                    )
        assert ctx.value.status_code == 403

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
        assert "visible.txt" in names
        assert "child" in names
        assert "node_modules" not in names
        assert ".env" not in names

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
        assert ".env" in names
        assert "node_modules" in names
        for item in items:
            assert "fullPath" in item
            assert "mtime" in item
            assert "size" in item

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
        assert len(items) == 1
        expected_path = (root_path / items[0]["name"]).resolve()
        assert expected_path == Path(items[0]["fullPath"]).resolve()

    async def test_get_folder_contents_blocks_outside_cwd(self) -> None:
        state = await self._build_state()
        with TemporaryDirectory() as tmpdir:
            with runtime_context(state) as runtime_ctx:
                with pytest.raises(HTTPException) as ctx:
                    route_get_folder_contents(
                        GetFolderContentsRequest(folderPath=tmpdir),
                        runtime_ctx,
                    )
        assert ctx.value.status_code == 403

    async def test_get_folder_contents_errors(self) -> None:
        state = await self._build_state()
        with TemporaryDirectory(dir=CWD) as tmpdir:
            root_path = Path(tmpdir)
            file_path = root_path / "file.txt"
            file_path.write_text("hi", encoding="utf-8")
            missing_path = root_path / "missing"
            with runtime_context(state) as runtime_ctx:
                with pytest.raises(HTTPException) as missing_ctx:
                    route_get_folder_contents(
                        GetFolderContentsRequest(folderPath=str(missing_path)),
                        runtime_ctx,
                    )
                assert missing_ctx.value.status_code == 404
                with pytest.raises(HTTPException) as directory_ctx:
                    route_get_folder_contents(
                        GetFolderContentsRequest(folderPath=str(file_path)),
                        runtime_ctx,
                    )
                assert directory_ctx.value.status_code == 400

    async def test_import_files_to_artifacts_share_mode_forbidden(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-import-files"
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
                with pytest.raises(HTTPException) as ctx:
                    await route_import_files_to_artifacts(
                        ImportFilesToArtifactsRequest(paths=["/tmp/ignored.txt"]),
                        runtime_ctx,
                    )
        assert ctx.value.status_code == 403

    async def test_import_files_to_artifacts_missing_path(self) -> None:
        state = await self._build_state()
        with TemporaryDirectory(dir=CWD) as tmpdir:
            missing_path = Path(tmpdir) / "missing.txt"
            with runtime_context(state) as runtime_ctx:
                with pytest.raises(HTTPException) as ctx:
                    await route_import_files_to_artifacts(
                        ImportFilesToArtifactsRequest(paths=[str(missing_path)]),
                        runtime_ctx,
                    )
        assert ctx.value.status_code == 404

    async def test_import_files_to_artifacts_directory_path(self) -> None:
        state = await self._build_state()
        with TemporaryDirectory(dir=CWD) as tmpdir:
            with runtime_context(state) as runtime_ctx:
                with pytest.raises(HTTPException) as ctx:
                    await route_import_files_to_artifacts(
                        ImportFilesToArtifactsRequest(paths=[tmpdir]),
                        runtime_ctx,
                    )
        assert ctx.value.status_code == 400

    async def test_import_files_to_artifacts_success(self) -> None:
        state = await self._build_state()
        with TemporaryDirectory(dir=CWD) as tmpdir:
            file_path = Path(tmpdir) / "sample.txt"
            contents = b"hello world"
            file_path.write_bytes(contents)
            with runtime_context(state) as runtime_ctx:
                results = await route_import_files_to_artifacts(
                    ImportFilesToArtifactsRequest(paths=[str(file_path)]),
                    runtime_ctx,
                )
        assert len(results) == 1
        result = results[0]
        assert file_path.name == result.name
        assert len(contents) == result.size
        cached = state.artifacts.get_cached_file(result.id)
        assert cached is not None
        assert cached is not None
        assert base64.b64encode(contents).decode("utf-8") == cached.value

    async def test_update_artifacts_rejects_oversized_file(self) -> None:
        state = await self._build_state()
        original_limit = artifact_router.DROPZONE_MAX_FILE_BYTES
        original_label = artifact_router.DROPZONE_MAX_FILE_LABEL
        try:
            artifact_router.DROPZONE_MAX_FILE_BYTES = 10
            artifact_router.DROPZONE_MAX_FILE_LABEL = "10 bytes"
            oversized_payload = base64.b64encode(b"a" * 11).decode("utf-8")
            artifact_id = (C.ARTIFACTS_FOLDER / "too-big.bin").as_posix()
            artifact = FileArtifact(id=artifact_id, value=oversized_payload)
            with runtime_context(state) as runtime_ctx:
                with pytest.raises(HTTPException) as ctx:
                    await route_update_artifacts(
                        UpdateArtifactsRequest(artifacts=[artifact]),
                        runtime_ctx,
                    )
            assert ctx.value.status_code == 413
        finally:
            artifact_router.DROPZONE_MAX_FILE_BYTES = original_limit
            artifact_router.DROPZONE_MAX_FILE_LABEL = original_label

    async def test_update_artifacts_rejects_oversized_chat_file(self) -> None:
        state = await self._build_state()
        original_limit = C.CHAT_ATTACHMENTS_MAX_FILE_BYTES
        original_label = C.CHAT_ATTACHMENTS_MAX_FILE_LABEL
        try:
            C.CHAT_ATTACHMENTS_MAX_FILE_BYTES = 5
            C.CHAT_ATTACHMENTS_MAX_FILE_LABEL = "5 bytes"
            oversized_payload = base64.b64encode(b"abcdef").decode("utf-8")
            artifact_id = (C.ARTIFACTS_FOLDER / "too-big.txt").as_posix()
            artifact = FileArtifact(id=artifact_id, value=oversized_payload)
            with runtime_context(state) as runtime_ctx:
                with pytest.raises(HTTPException) as ctx:
                    await route_update_artifacts(
                        UpdateArtifactsRequest(
                            artifacts=[artifact],
                            uploadScope="chat",
                        ),
                        runtime_ctx,
                    )
            assert ctx.value.status_code == 413
        finally:
            C.CHAT_ATTACHMENTS_MAX_FILE_BYTES = original_limit
            C.CHAT_ATTACHMENTS_MAX_FILE_LABEL = original_label

    async def test_import_files_to_artifacts_respects_chat_size_limit(self) -> None:
        state = await self._build_state()
        original_limit = C.CHAT_ATTACHMENTS_MAX_FILE_BYTES
        original_label = C.CHAT_ATTACHMENTS_MAX_FILE_LABEL
        try:
            C.CHAT_ATTACHMENTS_MAX_FILE_BYTES = 4
            C.CHAT_ATTACHMENTS_MAX_FILE_LABEL = "4 bytes"
            with TemporaryDirectory(dir=CWD) as tmpdir:
                file_path = Path(tmpdir) / "oversized.txt"
                file_path.write_bytes(b"12345")
                with runtime_context(state) as runtime_ctx:
                    with pytest.raises(HTTPException) as ctx:
                        await route_import_files_to_artifacts(
                            ImportFilesToArtifactsRequest(
                                paths=[str(file_path)],
                                uploadScope="chat",
                            ),
                            runtime_ctx,
                        )
            assert ctx.value.status_code == 413
        finally:
            C.CHAT_ATTACHMENTS_MAX_FILE_BYTES = original_limit
            C.CHAT_ATTACHMENTS_MAX_FILE_LABEL = original_label

    async def test_delete_artifacts_removes_file(self) -> None:
        state = await self._build_state()
        artifact_id = (C.ARTIFACTS_FOLDER / "dropzone.txt").as_posix()
        expected_id = Path(artifact_id).resolve().as_posix()
        artifact = FileArtifact(id=artifact_id, value=base64.b64encode(b"data").decode("utf-8"))
        with runtime_context(state) as runtime_ctx:
            await route_update_artifacts(
                UpdateArtifactsRequest(artifacts=[artifact]),
                runtime_ctx,
            )
            file_path = (CWD / artifact_id).resolve()
            assert file_path.exists()
            deleted = await route_delete_artifacts(
                DeleteArtifactsRequest(
                    artifacts=[
                        DeleteArtifactRequestItem(
                            id=artifact_id,
                            type=ArtifactType.File,
                        )
                    ]
                ),
                runtime_ctx,
            )
        assert expected_id in deleted
        assert not file_path.exists()
        assert state.artifacts.get_cached_file(artifact_id) is None

    async def test_delete_artifacts_rejects_non_file_type(self) -> None:
        state = await self._build_state()
        artifact_id = (C.ARTIFACTS_FOLDER / "chart.json").as_posix()
        with runtime_context(state) as runtime_ctx:
            with pytest.raises(HTTPException) as ctx:
                await route_delete_artifacts(
                    DeleteArtifactsRequest(
                        artifacts=[
                            DeleteArtifactRequestItem(
                                id=artifact_id,
                                type=ArtifactType.ChartData,
                            )
                        ]
                    ),
                    runtime_ctx,
                )
        assert ctx.value.status_code == 400

    async def test_delete_artifacts_rejects_outside_artifacts_root(self) -> None:
        state = await self._build_state()
        outside_id = "setta_files/code/should-not-delete.txt"
        with runtime_context(state) as runtime_ctx:
            with pytest.raises(HTTPException) as ctx:
                await route_delete_artifacts(
                    DeleteArtifactsRequest(
                        artifacts=[
                            DeleteArtifactRequestItem(
                                id=outside_id,
                                type=ArtifactType.File,
                            )
                        ]
                    ),
                    runtime_ctx,
                )
        assert ctx.value.status_code == 403
