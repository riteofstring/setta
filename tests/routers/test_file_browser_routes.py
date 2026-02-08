import json
import os
from contextlib import ExitStack
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
import pytest
import pytest_asyncio

from setta.binary import BinaryStore
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
from setta.routers.binary import route_binary_download, router as binary_router
from setta.server_state import SettaFastAPIState
from setta.types.routes import Route
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.types.share_deployment import ShareDeploymentManifest
from setta.types.artifact import ArtifactType, FileArtifact
from setta.types.binary_content import BinaryContentRef
from setta.utils.constants import C
from setta.utils.paths import get_setta_paths
from tests.utils.runtime_context import runtime_context
from tests.utils.manager_fixture import _seed_minimal_setta_files
from tests.utils.setta_paths import temporary_setta_paths


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


class TestFileBrowserRoutes:
    pytestmark = pytest.mark.asyncio

    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self):
        self._states: list[SettaFastAPIState] = []
        self._temp_dir = TemporaryDirectory()
        root = Path(self._temp_dir.name)
        self._stack = ExitStack()
        self._stack.enter_context(
            temporary_setta_paths(
                workspace_root=root,
                setta_files_root=root / "setta_files",
            )
        )
        for path in (
            C.SETTA_FILES_FOLDER,
            C.CODE_FOLDER,
            C.DB_BACKUP_FOLDER,
            C.ARTIFACTS_FOLDER,
            C.RUNTIME_FOLDER,
            C.RUNTIME_SESSIONS_FOLDER,
            C.RUNTIME_LOGS_FOLDER,
            C.RUNTIME_MCP_FOLDER,
            C.RUNTIME_SECRETS_FOLDER,
            C.DETACHED_RUNS_FOLDER,
            C.SHARE_DEPLOYMENTS_FOLDER,
        ):
            path.mkdir(parents=True, exist_ok=True)
        _seed_minimal_setta_files(C.SETTA_FILES_FOLDER)
        try:
            yield
        finally:
            for state in self._states:
                await _shutdown_state(state)
            self._stack.close()
            self._temp_dir.cleanup()

    async def _build_state(
        self,
        *,
        share_mode: bool = False,
        share_deployment_root: Path | None = None,
        app: FastAPI | None = None,
    ) -> SettaFastAPIState:
        if app is None:
            app = FastAPI()
        state = SettaFastAPIState(
            app,
            share_mode=share_mode,
            share_deployment_root=share_deployment_root,
            enable_mcp_connections=False,
            enable_language_server=False,
        )
        app.state.setta = state
        self._states.append(state)
        await state.wait_until_ready()
        return state

    async def test_get_file_browser_root_ide_mode(self) -> None:
        state = await self._build_state()
        with runtime_context(state) as runtime_ctx:
            response = route_get_file_browser_root(runtime_ctx)
        assert str(get_setta_paths().workspace_root) == response.rootPath
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
        with TemporaryDirectory(dir=str(get_setta_paths().workspace_root)) as tmpdir:
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
        with TemporaryDirectory(dir=str(get_setta_paths().workspace_root)) as tmpdir:
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
        with TemporaryDirectory(dir=str(get_setta_paths().workspace_root)) as tmpdir:
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
        with TemporaryDirectory(dir=str(get_setta_paths().workspace_root)) as tmpdir:
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
                        ImportFilesToArtifactsRequest(
                            paths=["/tmp/ignored.txt"],
                            uploadScope="generic",
                        ),
                        runtime_ctx,
                    )
        assert ctx.value.status_code == 403

    async def test_import_files_to_artifacts_missing_path(self) -> None:
        state = await self._build_state()
        with TemporaryDirectory(dir=str(get_setta_paths().workspace_root)) as tmpdir:
            missing_path = Path(tmpdir) / "missing.txt"
            with runtime_context(state) as runtime_ctx:
                with pytest.raises(HTTPException) as ctx:
                    await route_import_files_to_artifacts(
                        ImportFilesToArtifactsRequest(
                            paths=[str(missing_path)],
                            uploadScope="generic",
                        ),
                        runtime_ctx,
                    )
        assert ctx.value.status_code == 404

    async def test_import_files_to_artifacts_directory_path(self) -> None:
        state = await self._build_state()
        with TemporaryDirectory(dir=str(get_setta_paths().workspace_root)) as tmpdir:
            with runtime_context(state) as runtime_ctx:
                with pytest.raises(HTTPException) as ctx:
                    await route_import_files_to_artifacts(
                        ImportFilesToArtifactsRequest(
                            paths=[tmpdir],
                            uploadScope="generic",
                        ),
                        runtime_ctx,
                    )
        assert ctx.value.status_code == 400

    async def test_import_files_to_artifacts_success(self) -> None:
        state = await self._build_state()
        with TemporaryDirectory(dir=str(get_setta_paths().workspace_root)) as tmpdir:
            file_path = Path(tmpdir) / "sample.txt"
            contents = b"hello world"
            file_path.write_bytes(contents)
            with runtime_context(state) as runtime_ctx:
                results = await route_import_files_to_artifacts(
                    ImportFilesToArtifactsRequest(
                        paths=[str(file_path)],
                        uploadScope="generic",
                    ),
                    runtime_ctx,
                )
        assert len(results) == 1
        result = results[0]
        assert file_path.name == result.name
        assert len(contents) == result.size
        cached = state.artifacts.get_cached_file(result.id)
        assert cached is not None
        assert cached.value.byteLength == len(contents)
        binary_store = BinaryStore.from_dbe(state.dbe)
        stored = binary_store.read_bytes(cached.value.contentId)
        assert stored == contents

    async def test_update_artifacts_rejects_oversized_file(self) -> None:
        state = await self._build_state()
        original_limit = C.DROPZONE_STATEFUL_MAX_FILE_BYTES
        original_label = C.DROPZONE_STATEFUL_MAX_FILE_LABEL
        try:
            C.DROPZONE_STATEFUL_MAX_FILE_BYTES = 10
            C.DROPZONE_STATEFUL_MAX_FILE_LABEL = "10 bytes"
            artifact_id = (C.ARTIFACTS_FOLDER / "too-big.bin").as_posix()
            oversized_ref = BinaryContentRef(
                contentId="oversized",
                byteLength=11,
                mimeType="application/octet-stream",
            )
            artifact = FileArtifact(id=artifact_id, value=oversized_ref)
            with runtime_context(state) as runtime_ctx:
                with pytest.raises(HTTPException) as ctx:
                    await route_update_artifacts(
                        UpdateArtifactsRequest(
                            artifacts=[artifact],
                            uploadScope="generic",
                        ),
                        runtime_ctx,
                    )
            assert ctx.value.status_code == 413
        finally:
            C.DROPZONE_STATEFUL_MAX_FILE_BYTES = original_limit
            C.DROPZONE_STATEFUL_MAX_FILE_LABEL = original_label

    async def test_update_artifacts_rejects_when_dropzone_limit_disabled(
        self,
    ) -> None:
        state = await self._build_state()
        original_limit = C.DROPZONE_STATEFUL_MAX_FILE_BYTES
        original_label = C.DROPZONE_STATEFUL_MAX_FILE_LABEL
        try:
            C.DROPZONE_STATEFUL_MAX_FILE_BYTES = 0
            C.DROPZONE_STATEFUL_MAX_FILE_LABEL = "0 B"
            artifact_id = (C.ARTIFACTS_FOLDER / "blocked.bin").as_posix()
            ref = BinaryContentRef(
                contentId="blocked-dropzone",
                byteLength=1,
                mimeType="application/octet-stream",
            )
            artifact = FileArtifact(id=artifact_id, value=ref)
            with runtime_context(state) as runtime_ctx:
                with pytest.raises(HTTPException) as ctx:
                    await route_update_artifacts(
                        UpdateArtifactsRequest(
                            artifacts=[artifact],
                            uploadScope="generic",
                        ),
                        runtime_ctx,
                    )
            assert ctx.value.status_code == 413
        finally:
            C.DROPZONE_STATEFUL_MAX_FILE_BYTES = original_limit
            C.DROPZONE_STATEFUL_MAX_FILE_LABEL = original_label

    async def test_update_artifacts_rejects_oversized_chat_file(self) -> None:
        state = await self._build_state()
        original_limit = C.CHAT_ATTACHMENTS_MAX_FILE_BYTES
        original_label = C.CHAT_ATTACHMENTS_MAX_FILE_LABEL
        try:
            C.CHAT_ATTACHMENTS_MAX_FILE_BYTES = 5
            C.CHAT_ATTACHMENTS_MAX_FILE_LABEL = "5 bytes"
            artifact_id = (C.ARTIFACTS_FOLDER / "too-big.txt").as_posix()
            oversized_ref = BinaryContentRef(
                contentId="oversized-chat",
                byteLength=6,
                mimeType="text/plain",
            )
            artifact = FileArtifact(id=artifact_id, value=oversized_ref)
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

    async def test_update_artifacts_rejects_when_chat_limit_disabled(self) -> None:
        state = await self._build_state()
        original_limit = C.CHAT_ATTACHMENTS_MAX_FILE_BYTES
        original_label = C.CHAT_ATTACHMENTS_MAX_FILE_LABEL
        try:
            C.CHAT_ATTACHMENTS_MAX_FILE_BYTES = 0
            C.CHAT_ATTACHMENTS_MAX_FILE_LABEL = "0 B"
            artifact_id = (C.ARTIFACTS_FOLDER / "blocked.txt").as_posix()
            ref = BinaryContentRef(
                contentId="blocked-chat",
                byteLength=1,
                mimeType="text/plain",
            )
            artifact = FileArtifact(id=artifact_id, value=ref)
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

    async def test_update_artifacts_rejects_disallowed_chat_mime(self) -> None:
        state = await self._build_state()
        original_prefixes = C.CHAT_ATTACHMENTS_ALLOWED_MIME_PREFIXES
        try:
            C.CHAT_ATTACHMENTS_ALLOWED_MIME_PREFIXES = ["image/"]
            artifact_id = (C.ARTIFACTS_FOLDER / "notes.txt").as_posix()
            ref = BinaryContentRef(
                contentId="blocked-mime",
                byteLength=5,
                mimeType="text/plain",
            )
            artifact = FileArtifact(id=artifact_id, value=ref)
            with runtime_context(state) as runtime_ctx:
                with pytest.raises(HTTPException) as ctx:
                    await route_update_artifacts(
                        UpdateArtifactsRequest(
                            artifacts=[artifact],
                            uploadScope="chat",
                        ),
                        runtime_ctx,
                    )
            assert ctx.value.status_code == 415
        finally:
            C.CHAT_ATTACHMENTS_ALLOWED_MIME_PREFIXES = original_prefixes

    async def test_import_files_to_artifacts_rejects_disallowed_dropzone_mime(
        self,
    ) -> None:
        state = await self._build_state()
        original_prefixes = C.DROPZONE_ALLOWED_MIME_PREFIXES
        try:
            C.DROPZONE_ALLOWED_MIME_PREFIXES = ["image/"]
            with TemporaryDirectory(dir=str(get_setta_paths().workspace_root)) as tmpdir:
                file_path = Path(tmpdir) / "notes.txt"
                file_path.write_bytes(b"12345")
                with runtime_context(state) as runtime_ctx:
                    with pytest.raises(HTTPException) as ctx:
                        await route_import_files_to_artifacts(
                            ImportFilesToArtifactsRequest(
                                paths=[str(file_path)],
                                uploadScope="generic",
                            ),
                            runtime_ctx,
                        )
            assert ctx.value.status_code == 415
        finally:
            C.DROPZONE_ALLOWED_MIME_PREFIXES = original_prefixes

    async def test_import_files_to_artifacts_respects_chat_size_limit(self) -> None:
        state = await self._build_state()
        original_limit = C.CHAT_ATTACHMENTS_MAX_FILE_BYTES
        original_label = C.CHAT_ATTACHMENTS_MAX_FILE_LABEL
        try:
            C.CHAT_ATTACHMENTS_MAX_FILE_BYTES = 4
            C.CHAT_ATTACHMENTS_MAX_FILE_LABEL = "4 bytes"
            with TemporaryDirectory(dir=str(get_setta_paths().workspace_root)) as tmpdir:
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
        binary_store = BinaryStore.from_dbe(state.dbe)
        payload_ref = binary_store.store_bytes(
            b"data", mime_type="text/plain"
        )
        artifact = FileArtifact(id=artifact_id, value=payload_ref)
        with runtime_context(state) as runtime_ctx:
            await route_update_artifacts(
                UpdateArtifactsRequest(
                    artifacts=[artifact],
                    uploadScope="generic",
                ),
                runtime_ctx,
            )
            file_path = (get_setta_paths().workspace_root / artifact_id).resolve()
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

    async def test_binary_upload_and_download(self) -> None:
        app = FastAPI()
        state = await self._build_state(app=app)
        app.include_router(binary_router, prefix=Route.PREFIX.value)
        payload = b"binary-payload"
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"{Route.PREFIX.value}{Route.BINARY_UPLOAD.value}",
                files={"file": ("payload.bin", payload, "application/octet-stream")},
            )
        assert response.status_code == 200
        ref = BinaryContentRef(**response.json())
        with runtime_context(state) as runtime_ctx:
            response = route_binary_download(ref.contentId, runtime_ctx)
        binary_store = BinaryStore.from_dbe(state.dbe)
        assert binary_store.read_bytes(ref.contentId) == payload
        assert response.media_type == "application/octet-stream"
        assert Path(response.path).read_bytes() == payload

    async def test_binary_upload_allows_non_durable(self) -> None:
        app = FastAPI()
        state = await self._build_state(app=app)
        app.include_router(binary_router, prefix=Route.PREFIX.value)
        payload = b"temporary"
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"{Route.PREFIX.value}{Route.BINARY_UPLOAD.value}",
                data={"durable": "false"},
                files={"file": ("payload.bin", payload, "application/octet-stream")},
            )
        assert response.status_code == 200
        ref = BinaryContentRef(**response.json())
        binary_store = BinaryStore.from_dbe(state.dbe)
        metadata_path = binary_store.root / f"{ref.contentId}.json"
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        assert metadata["durable"] is False

    async def test_binary_download_rejects_invalid_content_id(self) -> None:
        state = await self._build_state()
        with runtime_context(state) as runtime_ctx:
            with pytest.raises(HTTPException) as ctx:
                route_binary_download("..", runtime_ctx)
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
