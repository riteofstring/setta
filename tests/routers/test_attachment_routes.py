import os
from datetime import datetime, timedelta, timezone
from contextlib import contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI, HTTPException
import pytest

from setta.auth.session import load_current_session_secret
from setta.binary import BinaryStore
from setta.database.db_objs import DBE
from setta.routers.attachments import (
    GetAttachmentDownloadUrlRequest,
    GetAttachmentDownloadUrlsRequest,
    _TOKEN_MANAGER,
    route_download_attachment,
    route_get_attachment_download_url,
    route_get_attachment_download_urls,
)
from setta.routers.artifact import UpdateArtifactsRequest, route_update_artifacts
from setta.server_state import SettaFastAPIState
from setta.sessions.constants import SESSION_ID_ENV_VAR, SESSIONS_ROOT_ENV_VAR
from setta.sessions.registry import SessionRegistry
from setta.types.artifact import FileArtifact
from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.types.share_deployment import (
    DeploymentType,
    DeploymentManifest,
    SharePolicy,
)
from setta.utils.constants import C, CWD
from tests.utils.manager_fixture import _populate_project_fixture_files
from tests.utils.runtime_context import runtime_context


@contextmanager
def _patched_setta_paths(tmpdir: str) -> Path:
    setta_root = Path(tmpdir) / "setta_files"
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

    _populate_project_fixture_files(setta_root)

    previous_values = {
        "SETTA_FILES_FOLDER": C.SETTA_FILES_FOLDER,
        "CODE_FOLDER": C.CODE_FOLDER,
        "ARTIFACTS_FOLDER": C.ARTIFACTS_FOLDER,
        "DB_BACKUP_FOLDER": C.DB_BACKUP_FOLDER,
        "RUN_FOLDER": C.RUN_FOLDER,
        "RUN_SESSIONS_FOLDER": C.RUN_SESSIONS_FOLDER,
        "RUN_LOGS_FOLDER": C.RUN_LOGS_FOLDER,
        "DEPLOYMENTS_FOLDER": C.DEPLOYMENTS_FOLDER,
    }

    C.SETTA_FILES_FOLDER = setta_root
    C.CODE_FOLDER = code_folder
    C.ARTIFACTS_FOLDER = artifacts_folder
    C.DB_BACKUP_FOLDER = backup_folder
    C.RUN_FOLDER = run_folder
    C.RUN_SESSIONS_FOLDER = run_sessions_folder
    C.RUN_LOGS_FOLDER = run_logs_folder
    C.DEPLOYMENTS_FOLDER = share_deployments_folder

    try:
        yield setta_root
    finally:
        C.SETTA_FILES_FOLDER = previous_values["SETTA_FILES_FOLDER"]
        C.CODE_FOLDER = previous_values["CODE_FOLDER"]
        C.ARTIFACTS_FOLDER = previous_values["ARTIFACTS_FOLDER"]
        C.DB_BACKUP_FOLDER = previous_values["DB_BACKUP_FOLDER"]
        C.RUN_FOLDER = previous_values["RUN_FOLDER"]
        C.RUN_SESSIONS_FOLDER = previous_values["RUN_SESSIONS_FOLDER"]
        C.RUN_LOGS_FOLDER = previous_values["RUN_LOGS_FOLDER"]
        C.DEPLOYMENTS_FOLDER = previous_values["DEPLOYMENTS_FOLDER"]


@contextmanager
def _set_env(key: str, value: str | None) -> None:
    previous = os.environ.get(key)
    if value is None:
        os.environ.pop(key, None)
    else:
        os.environ[key] = value
    try:
        yield
    finally:
        if previous is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = previous


@contextmanager
def _set_session_env(session_id: str, sessions_root: Path) -> None:
    with _set_env(SESSION_ID_ENV_VAR, session_id):
        with _set_env(SESSIONS_ROOT_ENV_VAR, str(sessions_root)):
            yield


def _create_session(root: Path) -> tuple[str, Path]:
    sessions_root = root / "sessions"
    sessions_root.mkdir(parents=True, exist_ok=True)
    registry = SessionRegistry(sessions_root=sessions_root)
    session = registry.create_session(
        workspace_path=root,
        host="127.0.0.1",
        port=8000,
        pid=os.getpid(),
    )
    return session.id, sessions_root


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
) -> ID:
    dbe = DBE(root)
    project_config = ProjectConfig(name=project_config_name)
    project_state = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        defaultProjectConfigId=project_config.id,
    )
    dbe.write_project(project_state)
    deployment_name = root.parent.name
    manifest = DeploymentManifest(
        version=1,
        deploymentName=deployment_name,
        deploymentType=DeploymentType.share,
        defaultProjectConfigId=project_config.id,
        deploymentVersion=deployment_version,
    )
    dbe.write_json(root / "manifest.json", manifest.model_dump())
    return project_config.id


def _write_share_policy(root: Path, policy: SharePolicy) -> None:
    dbe = DBE(root)
    dbe.write_json(root / "share_policy.json", policy.model_dump())


async def _build_state() -> SettaFastAPIState:
    app = FastAPI()
    state = SettaFastAPIState(
        app,
        enable_mcp_connections=False,
        enable_language_server=False,
    )
    await state.wait_until_ready()
    return state


async def _shutdown_state(state: SettaFastAPIState) -> None:
    if state.project_manager_switcher:
        for manager in state.project_manager_switcher.project_managers:
            manager.shutdown()
    if state.specific_file_watcher:
        state.specific_file_watcher.stop()
    if not state.mcp_client.disabled:
        await state.mcp_client.stop()


def _extract_token(url: str) -> str:
    token_part = url.split("/attachments/")[-1]
    return token_part.split("?")[0]


class TestAttachmentRoutes:
    pytestmark = pytest.mark.asyncio

    async def test_get_attachment_download_url_blocks_invalid_path(self) -> None:
        with TemporaryDirectory() as tmpdir:
            with _patched_setta_paths(tmpdir):
                root = Path(tmpdir)
                session_id, sessions_root = _create_session(root)
                with _set_session_env(session_id, sessions_root):
                    state = await _build_state()
                    try:
                        request = GetAttachmentDownloadUrlRequest(
                            artifactId="../secrets.txt"
                        )
                        with runtime_context(state) as runtime_ctx:
                            with pytest.raises(HTTPException) as ctx:
                                await route_get_attachment_download_url(
                                    request, runtime_ctx
                                )
                        assert ctx.value.status_code == 404
                    finally:
                        await _shutdown_state(state)

    async def test_get_attachment_download_url_blocks_outside_artifacts(self) -> None:
        with TemporaryDirectory() as tmpdir:
            with _patched_setta_paths(tmpdir):
                root = Path(tmpdir)
                session_id, sessions_root = _create_session(root)
                with _set_session_env(session_id, sessions_root):
                    state = await _build_state()
                    try:
                        with TemporaryDirectory(dir=CWD) as outside_dir:
                            outside_path = Path(outside_dir) / "outside.txt"
                            outside_path.write_text("secret", encoding="utf-8")
                            request = GetAttachmentDownloadUrlRequest(
                                artifactId=outside_path.as_posix()
                            )
                            with runtime_context(state) as runtime_ctx:
                                with pytest.raises(HTTPException) as ctx:
                                    await route_get_attachment_download_url(
                                        request, runtime_ctx
                                    )
                            assert ctx.value.status_code == 404
                    finally:
                        await _shutdown_state(state)

    async def test_download_attachment_returns_404_when_missing(self) -> None:
        with TemporaryDirectory() as tmpdir:
            with _patched_setta_paths(tmpdir):
                root = Path(tmpdir)
                session_id, sessions_root = _create_session(root)
                with _set_session_env(session_id, sessions_root):
                    state = await _build_state()
                    try:
                        artifact_path = (
                            Path(C.ARTIFACTS_FOLDER) / "notes.txt"
                        ).resolve()
                        artifact_path.parent.mkdir(parents=True, exist_ok=True)
                        artifact_path.write_text("hello", encoding="utf-8")
                        request = GetAttachmentDownloadUrlRequest(
                            artifactId=artifact_path.as_posix()
                        )
                        with runtime_context(state) as runtime_ctx:
                            response = await route_get_attachment_download_url(
                                request, runtime_ctx
                            )
                        artifact_path.unlink()
                        token = _extract_token(response.url)
                        with runtime_context(state) as runtime_ctx:
                            with pytest.raises(HTTPException) as ctx:
                                await route_download_attachment(token, runtime_ctx)
                        assert ctx.value.status_code == 404
                    finally:
                        await _shutdown_state(state)

    async def test_download_urls_blocked_when_policy_disallows(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-attachments-policy"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, SharePolicy(allowFileDownloads=False))
            artifacts_root = root / "artifacts"
            artifacts_root.mkdir(parents=True, exist_ok=True)
            artifact_path = artifacts_root / "file.txt"
            artifact_path.write_text("hello", encoding="utf-8")
            state = SettaFastAPIState(
                FastAPI(),
                share_mode=True,
                share_deployment_root=root,
                enable_mcp_connections=False,
                enable_language_server=False,
            )
            await state.wait_until_ready()
            session = state.share_session_store.create_session()
            state.share_runtime_state.create_session_backend(session.id)
            try:
                request = GetAttachmentDownloadUrlRequest(
                    artifactId=artifact_path.relative_to(root).as_posix()
                )
                with runtime_context(state, session.id) as runtime_ctx:
                    with pytest.raises(HTTPException) as ctx:
                        await route_get_attachment_download_url(
                            request, runtime_ctx
                        )
                assert ctx.value.status_code == 403
            finally:
                await _shutdown_state(state)

    async def test_download_attachment_returns_403_when_token_expired(self) -> None:
        with TemporaryDirectory() as tmpdir:
            with _patched_setta_paths(tmpdir):
                root = Path(tmpdir)
                session_id, sessions_root = _create_session(root)
                with _set_session_env(session_id, sessions_root):
                    state = await _build_state()
                    try:
                        session_info = load_current_session_secret()
                        assert session_info is not None
                        _, secret = session_info
                        past = datetime.now(timezone.utc) - timedelta(
                            seconds=C.CHAT_ATTACHMENTS_TOKEN_TTL_SECONDS + 5
                        )
                        token = _TOKEN_MANAGER.mint(
                            artifact_id="artifacts/missing.txt",
                            secret=secret,
                            share_session_id="main",
                            now=past,
                        )
                        with runtime_context(state) as runtime_ctx:
                            with pytest.raises(HTTPException) as ctx:
                                await route_download_attachment(token, runtime_ctx)
                        assert ctx.value.status_code == 403
                    finally:
                        await _shutdown_state(state)

    async def test_download_attachment_rejects_share_session_id_in_ide_mode(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            with _patched_setta_paths(tmpdir):
                root = Path(tmpdir)
                session_id, sessions_root = _create_session(root)
                with _set_session_env(session_id, sessions_root):
                    state = await _build_state()
                    try:
                        session_info = load_current_session_secret()
                        assert session_info is not None
                        _, secret = session_info
                        token = _TOKEN_MANAGER.mint(
                            artifact_id="artifacts/missing.txt",
                            secret=secret,
                            share_session_id="main",
                        )
                        with runtime_context(state) as runtime_ctx:
                            with pytest.raises(HTTPException) as ctx:
                                await route_download_attachment(token, runtime_ctx)
                        assert ctx.value.status_code == 403
                    finally:
                        await _shutdown_state(state)

    async def test_download_attachment_validates_project_config_id(self) -> None:
        with TemporaryDirectory() as tmpdir:
            with _patched_setta_paths(tmpdir):
                root = Path(tmpdir)
                session_id, sessions_root = _create_session(root)
                with _set_session_env(session_id, sessions_root):
                    state = await _build_state()
                    try:
                        artifact_path = (
                            Path(C.ARTIFACTS_FOLDER) / "notes.txt"
                        ).resolve()
                        artifact_path.parent.mkdir(parents=True, exist_ok=True)
                        artifact_path.write_text("hello", encoding="utf-8")
                        session_info = load_current_session_secret()
                        assert session_info is not None
                        _, secret = session_info
                        token = _TOKEN_MANAGER.mint(
                            artifact_id=artifact_path.as_posix(),
                            secret=secret,
                            project_config_id="missing",
                        )
                        with runtime_context(state) as runtime_ctx:
                            with pytest.raises(HTTPException) as ctx:
                                await route_download_attachment(token, runtime_ctx)
                        assert ctx.value.status_code == 404
                    finally:
                        await _shutdown_state(state)

    async def test_download_attachment_handles_unicode_filename(self) -> None:
        with TemporaryDirectory() as tmpdir:
            with _patched_setta_paths(tmpdir):
                root = Path(tmpdir)
                session_id, sessions_root = _create_session(root)
                with _set_session_env(session_id, sessions_root):
                    state = await _build_state()
                    try:
                        filename = "Screenshot 2026-01-30 8.59.34\u202fAM.png"
                        artifact_path = (
                            Path(C.ARTIFACTS_FOLDER) / filename
                        ).resolve()
                        artifact_path.parent.mkdir(parents=True, exist_ok=True)
                        artifact_path.write_bytes(b"hello")
                        request = GetAttachmentDownloadUrlRequest(
                            artifactId=artifact_path.as_posix()
                        )
                        with runtime_context(state) as runtime_ctx:
                            response = await route_get_attachment_download_url(
                                request, runtime_ctx
                            )
                        token = _extract_token(response.url)
                        with runtime_context(state) as runtime_ctx:
                            downloaded = await route_download_attachment(
                                token, runtime_ctx
                            )
                        content_disposition = downloaded.headers.get(
                            "content-disposition"
                        )
                        assert content_disposition is not None
                        content_disposition.encode("latin-1")
                        assert "filename*=" in content_disposition
                        assert "\u202f" not in content_disposition
                        assert downloaded.body == b"hello"
                    finally:
                        await _shutdown_state(state)

    async def test_get_attachment_download_urls_skips_invalid_entries(self) -> None:
        with TemporaryDirectory() as tmpdir:
            with _patched_setta_paths(tmpdir):
                root = Path(tmpdir)
                session_id, sessions_root = _create_session(root)
                with _set_session_env(session_id, sessions_root):
                    state = await _build_state()
                    try:
                        artifact_path = (
                            Path(C.ARTIFACTS_FOLDER) / "notes.txt"
                        ).resolve()
                        artifact_path.parent.mkdir(parents=True, exist_ok=True)
                        artifact_path.write_text("hello", encoding="utf-8")
                        request = GetAttachmentDownloadUrlsRequest(
                            artifactIds=[
                                artifact_path.as_posix(),
                                "../secrets.txt",
                            ]
                        )
                        with runtime_context(state) as runtime_ctx:
                            response = await route_get_attachment_download_urls(
                                request, runtime_ctx
                            )
                        assert len(response) == 1
                        entry = response[0]
                        assert entry.artifactId == artifact_path.as_posix()
                        token = _extract_token(entry.url)
                        with runtime_context(state) as runtime_ctx:
                            downloaded = await route_download_attachment(
                                token, runtime_ctx
                            )
                        assert downloaded.body == b"hello"
                    finally:
                        await _shutdown_state(state)

    async def test_update_artifacts_blocks_disallowed_mime(self) -> None:
        with TemporaryDirectory() as tmpdir:
            with _patched_setta_paths(tmpdir):
                root = Path(tmpdir)
                session_id, sessions_root = _create_session(root)
                with _set_session_env(session_id, sessions_root):
                    state = await _build_state()
                    previous_prefixes = C.CHAT_ATTACHMENTS_ALLOWED_MIME_PREFIXES
                    C.CHAT_ATTACHMENTS_ALLOWED_MIME_PREFIXES = ["text/"]
                    try:
                        binary_store = BinaryStore.from_dbe(state.dbe)
                        ref = binary_store.store_bytes(
                            b"payload", mime_type="image/png"
                        )
                        artifact = FileArtifact(
                            id=(Path(C.ARTIFACTS_FOLDER) / "image.png").as_posix(),
                            value=ref,
                        )
                        request = UpdateArtifactsRequest(
                            artifacts=[artifact],
                            uploadScope="chat",
                        )
                        with runtime_context(state) as runtime_ctx:
                            with pytest.raises(HTTPException) as ctx:
                                await route_update_artifacts(request, runtime_ctx)
                        assert ctx.value.status_code == 415
                    finally:
                        C.CHAT_ATTACHMENTS_ALLOWED_MIME_PREFIXES = previous_prefixes
                        await _shutdown_state(state)

    async def test_update_artifacts_allows_disallowed_mime_for_generic_scope(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            with _patched_setta_paths(tmpdir):
                root = Path(tmpdir)
                session_id, sessions_root = _create_session(root)
                with _set_session_env(session_id, sessions_root):
                    state = await _build_state()
                    previous_prefixes = C.CHAT_ATTACHMENTS_ALLOWED_MIME_PREFIXES
                    C.CHAT_ATTACHMENTS_ALLOWED_MIME_PREFIXES = ["text/"]
                    try:
                        binary_store = BinaryStore.from_dbe(state.dbe)
                        ref = binary_store.store_bytes(
                            b"payload", mime_type="image/png"
                        )
                        artifact = FileArtifact(
                            id=(Path(C.ARTIFACTS_FOLDER) / "image.png").as_posix(),
                            value=ref,
                        )
                        request = UpdateArtifactsRequest(
                            artifacts=[artifact],
                            uploadScope="generic",
                        )
                        with runtime_context(state) as runtime_ctx:
                            result = await route_update_artifacts(request, runtime_ctx)
                        assert result
                    finally:
                        C.CHAT_ATTACHMENTS_ALLOWED_MIME_PREFIXES = previous_prefixes
                        await _shutdown_state(state)
