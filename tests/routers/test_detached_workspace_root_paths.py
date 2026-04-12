import asyncio
import json
import os
from contextlib import contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

from fastapi import HTTPException
import pytest

from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.project_state.artifacts import Artifacts
from setta.project_state.code_files import CodeFiles
from setta.project_state.jsonSource.jsonSource import JSONSource
from setta.project_state.project_manager_types import DeleteJSONSourceFileAndVariantRequest
from setta.project_state.session_project_manager import (
    SessionPersistenceMode,
    SessionProjectManager,
)
from setta.runtime.context import RuntimeContext
from setta.routers.artifact import CheckIfFileExistsRequests, route_check_if_file_exists
from setta.routers.sections import (
    CreateFileRequest,
    NewJSONVersionNameRequest,
    route_create_file,
    route_new_json_version_name,
)
from setta.types.helpers_lvl2 import create_top_level_section
from setta.types.project_config import Position
from setta.types.section_impls import SectionType
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.websocket_manager import WebsocketManager

from tests.utils.manager_fixture import _populate_project_fixture_files
from tests.utils.setta_paths import temporary_setta_paths


@contextmanager
def _chdir(path: Path):
    previous = Path.cwd()
    os.chdir(path)
    try:
        yield
    finally:
        os.chdir(previous)


@contextmanager
def _detached_roots(tmpdir: str):
    base = Path(tmpdir)
    env_root = base / "env"
    workspace_root = base / "workspace"
    setta_home = base / ".setta"
    global_setta_files_base = setta_home / "setta_files"

    env_root.mkdir(parents=True, exist_ok=True)
    workspace_root.mkdir(parents=True, exist_ok=True)
    setta_home.mkdir(parents=True, exist_ok=True)
    global_setta_files_base.mkdir(parents=True, exist_ok=True)

    from setta.utils.paths import build_files_root_from_base

    setta_root = build_files_root_from_base(global_setta_files_base, workspace_root)
    setta_root.mkdir(parents=True, exist_ok=True)

    for path in (
        setta_root / "code",
        setta_root / "artifacts",
        setta_root / "backups",
    ):
        path.mkdir(parents=True, exist_ok=True)

    _populate_project_fixture_files(setta_root)
    (setta_home / "config.json").write_text(
        json.dumps(
            {
                "globalSettaFilesBase": str(global_setta_files_base),
                "autoMode": "create_local",
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    with temporary_setta_paths(
        workspace_root=workspace_root,
        setta_home=setta_home,
        setta_files_location="global",
    ):
        yield workspace_root, env_root, setta_root


def _ide_runtime_context() -> RuntimeContext:
    state = SimpleNamespace(
        share_mode=False,
        deployment_mode=False,
        launcher_mode=False,
    )
    return RuntimeContext(state)


async def _build_project_manager(setta_root: Path) -> SessionProjectManager:
    websocket_manager = WebsocketManager()
    listener_registry = ListenerRegistry()
    frontend_sender = WMHFrontendSender(websocket_manager)
    python_script_sender = WMHPythonScriptSender(websocket_manager, listener_registry)
    dbe = DBE(setta_root)
    settings_file = SettingsFile(dbe, frontend_sender)
    specific_file_watcher = SpecificFileWatcher()
    artifacts = Artifacts(frontend_sender, specific_file_watcher, dbe)
    code_files = CodeFiles(frontend_sender, specific_file_watcher, dbe)
    json_source = JSONSource(frontend_sender, settings_file, specific_file_watcher, dbe)

    manager = SessionProjectManager(
        persistence_mode=SessionPersistenceMode.ide_main,
        frontend_sender=frontend_sender,
        python_script_sender=python_script_sender,
        settings_file=settings_file,
        specific_file_watcher=specific_file_watcher,
        dbe=dbe,
        artifacts=artifacts,
        json_source=json_source,
        code_files=code_files,
        lsp_writers=None,
    )
    await manager._process_queue_task_started.wait()
    return manager


class TestDetachedWorkspaceRootPaths:
    pytestmark = pytest.mark.asyncio

    async def test_create_file_is_workspace_relative(self) -> None:
        with TemporaryDirectory() as tmpdir:
            with _detached_roots(tmpdir) as (workspace_root, env_root, _setta_root):
                ctx = _ide_runtime_context()
                with _chdir(env_root):
                    relative = "json_sources/created.json"
                    route_create_file(CreateFileRequest(filepath=relative), ctx)

                assert (workspace_root / relative).exists()
                assert not (env_root / relative).exists()

                with pytest.raises(HTTPException) as exc:
                    with _chdir(env_root):
                        route_create_file(
                            CreateFileRequest(filepath="../escape.json"),
                            ctx,
                        )
                assert exc.value.status_code == 403

    async def test_new_json_version_name_is_workspace_relative(self) -> None:
        with TemporaryDirectory() as tmpdir:
            with _detached_roots(tmpdir) as (workspace_root, env_root, _setta_root):
                ctx = _ide_runtime_context()
                with _chdir(env_root):
                    pattern = "json_sources/version.json"
                    result = route_new_json_version_name(
                        NewJSONVersionNameRequest(filename=pattern),
                        ctx,
                    )

                assert isinstance(result, str)
                assert result.startswith("json_sources/version_")
                assert (workspace_root / result).exists()
                assert not (env_root / result).exists()

                with pytest.raises(HTTPException) as exc:
                    with _chdir(env_root):
                        route_new_json_version_name(
                            NewJSONVersionNameRequest(filename="../escape.json"),
                            ctx,
                        )
                assert exc.value.status_code == 403

    async def test_check_if_file_exists_is_workspace_relative(self) -> None:
        with TemporaryDirectory() as tmpdir:
            with _detached_roots(tmpdir) as (workspace_root, env_root, _setta_root):
                ctx = _ide_runtime_context()
                (workspace_root / "exists.txt").write_text("ok", encoding="utf-8")
                (env_root / "only-cwd.txt").write_text("no", encoding="utf-8")

                with _chdir(env_root):
                    assert route_check_if_file_exists(
                        CheckIfFileExistsRequests(filepath="exists.txt"),
                        ctx,
                    )
                    assert not route_check_if_file_exists(
                        CheckIfFileExistsRequests(filepath="only-cwd.txt"),
                        ctx,
                    )

                with pytest.raises(HTTPException) as exc:
                    with _chdir(env_root):
                        route_check_if_file_exists(
                            CheckIfFileExistsRequests(
                                filepath=str(env_root / "only-cwd.txt")
                            ),
                            ctx,
                        )
                assert exc.value.status_code == 403

    async def test_delete_json_source_file_deletes_from_workspace_root(self) -> None:
        with TemporaryDirectory() as tmpdir:
            with _detached_roots(tmpdir) as (workspace_root, env_root, setta_root):
                manager = await _build_project_manager(setta_root)
                try:
                    default_project_config_id = (
                        manager.project_state_backend.defaultProjectConfigId
                    )
                    assert (
                        default_project_config_id is not None
                    ), "Expected default project config id."
                    project_state = manager.get_single_config_state(
                        default_project_config_id
                    )
                    section_id = create_top_level_section(
                        manager.settings_file.settings,
                        project_state,
                        SectionType.Dict,
                        Position(x=0, y=0),
                    )
                    await manager.update_and_broadcast_project_state(project_state)
                    variant_id = project_state.sections[section_id].variants[0]

                    relative = "json_sources/to_delete.json"
                    workspace_file = workspace_root / relative
                    workspace_file.parent.mkdir(parents=True, exist_ok=True)
                    workspace_file.write_text("workspace", encoding="utf-8")
                    env_file = env_root / relative
                    env_file.parent.mkdir(parents=True, exist_ok=True)
                    env_file.write_text("cwd", encoding="utf-8")

                    with _chdir(env_root):
                        request = DeleteJSONSourceFileAndVariantRequest(
                            projectConfigId=default_project_config_id,
                            sectionId=section_id,
                            variantId=variant_id,
                            filepath=relative,
                        )
                        await manager.delete_json_source_file_and_variant(request)

                    assert not workspace_file.exists()
                    assert env_file.exists()
                finally:
                    manager.shutdown()
                    try:
                        await manager.queue_task
                    except asyncio.CancelledError:
                        pass
