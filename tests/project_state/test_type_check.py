from contextlib import asynccontextmanager
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.lsp.managers import NoopLSPWriters
from setta.project_state.artifacts import Artifacts
from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.code_files import CodeFiles
from setta.project_state.jsonSource.jsonSource import JSONSource
from setta.project_state.project_code import ProjectPythonCode
from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.utils.constants import C
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.websocket_manager import WebsocketManager


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


class TypeCheckProjectManager(BaseProjectManager):
    def __init__(
        self,
        lsp_writers,
        websocket_msg_handler,
        python_script_sender,
        settings_file,
        specific_file_watcher,
        dbe,
        artifacts,
        json_source,
        code_files,
        initial_backend: ProjectStateBackend,
    ):
        self._initial_backend = initial_backend
        super().__init__(
            lsp_writers,
            websocket_msg_handler,
            python_script_sender,
            settings_file,
            specific_file_watcher,
            dbe,
            artifacts,
            json_source,
            code_files,
        )

    def load_initial_state(self) -> ProjectStateBackend:
        return self._initial_backend.model_copy(deep=True)

    def save(self):  # pragma: no cover - not used in these tests
        return None

    async def save_as_new_project_config(self, _x):  # pragma: no cover
        return None


class DummyGenCode:
    def __init__(self) -> None:
        self.calls = 0

    async def type_check(self) -> None:
        self.calls += 1


class DummyPythonCode(ProjectPythonCode):
    def __init__(self) -> None:
        self.calls = 0

    async def type_check(self) -> None:
        self.calls += 1


class DummyNonPythonCode:
    def __init__(self) -> None:
        self.calls = 0

    async def type_check(self) -> None:
        self.calls += 1


@asynccontextmanager
async def _type_check_manager(*, codegen_targets):
    temp_dir = TemporaryDirectory()
    previous = _set_temp_constants(Path(temp_dir.name))
    manager = None
    try:
        websocket_manager = WebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        listener_registry = ListenerRegistry()
        python_script_sender = WMHPythonScriptSender(
            websocket_manager, listener_registry
        )
        dbe = DBE(C.SETTA_FILES_FOLDER)
        settings_file = SettingsFile(dbe, frontend_sender)
        specific_file_watcher = SpecificFileWatcher()
        artifacts = Artifacts(frontend_sender, specific_file_watcher, dbe)
        code_files = CodeFiles(frontend_sender, specific_file_watcher, dbe)
        json_source = JSONSource(
            frontend_sender, settings_file, specific_file_watcher, dbe
        )
        lsp_writers = NoopLSPWriters()

        project_config = ProjectConfig(
            id=ID("project-1"),
            name="TypeCheckProject",
            codegenTargets=codegen_targets,
        )
        backend = ProjectStateBackend(projectConfigs={project_config.id: project_config})

        manager = TypeCheckProjectManager(
            lsp_writers,
            frontend_sender,
            python_script_sender,
            settings_file,
            specific_file_watcher,
            dbe,
            artifacts,
            json_source,
            code_files,
            backend,
        )
        await manager._process_queue_task_started.wait()
        yield manager
    finally:
        if manager is not None:
            manager.shutdown()
        _restore_constants(previous)
        temp_dir.cleanup()


@pytest.mark.asyncio
async def test_type_check_runs_python_sections_without_codegen() -> None:
    async with _type_check_manager(codegen_targets=[]) as manager:
        project_config_id = next(iter(manager.project_state_backend.projectConfigs))
        python_code = DummyPythonCode()
        other_code = DummyNonPythonCode()
        manager.code_dict[project_config_id] = {
            ID("section-python"): python_code,
            ID("section-other"): other_code,
        }

        await manager.type_check(project_config_id)

        assert python_code.calls == 1
        assert other_code.calls == 0


@pytest.mark.asyncio
async def test_type_check_runs_gen_code_and_python_sections() -> None:
    async with _type_check_manager(codegen_targets=ProjectConfig().codegenTargets) as (
        manager
    ):
        project_config_id = next(iter(manager.project_state_backend.projectConfigs))
        gen_code = DummyGenCode()
        python_code = DummyPythonCode()
        manager.gen_code[project_config_id] = gen_code
        manager.code_dict[project_config_id] = {ID("section-python"): python_code}

        await manager.type_check(project_config_id)

        assert gen_code.calls == 1
        assert python_code.calls == 1
