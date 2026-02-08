import asyncio
from collections.abc import AsyncIterator
from contextlib import AsyncExitStack, asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.project_state.artifacts import Artifacts
from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.code_files import CodeFiles
from setta.project_state.jsonSource.jsonSource import JSONSource
from setta.project_state.settings_project import create_settings_project_state
from setta.project_state.session_project_manager import (
    SessionPersistenceMode,
    SessionProjectManager,
)
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID
from setta.types.generated.settings_state import SettingsState
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs, MCPServerConfig
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.utils.constants import C
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.websocket_manager import WebsocketManager

from tests.utils.setta_paths import temporary_setta_paths
__all__ = [
    "ProjectManagerFixture",
    "SettingsManagerFixture",
    "real_project_manager",
    "real_settings_manager",
]


@dataclass(slots=True)
class SettingsManagerFixture:
    manager: SessionProjectManager
    setta_root: Path
    code_folder: Path
    artifacts_folder: Path
    dbe: DBE
    settings_file: SettingsFile
    artifacts: Artifacts
    json_source: JSONSource
    code_files: CodeFiles
    python_script_sender: WMHPythonScriptSender
    websocket_manager: WebsocketManager
    listener_registry: ListenerRegistry


@dataclass(slots=True)
class ProjectManagerFixture:
    manager: SessionProjectManager
    setta_root: Path
    code_folder: Path
    artifacts_folder: Path
    dbe: DBE
    settings_file: SettingsFile
    artifacts: Artifacts
    json_source: JSONSource
    code_files: CodeFiles
    python_script_sender: WMHPythonScriptSender
    websocket_manager: WebsocketManager
    listener_registry: ListenerRegistry


@asynccontextmanager
async def real_settings_manager() -> AsyncIterator[SettingsManagerFixture]:
    """Provision a SessionProjectManager (settings) backed by real collaborators.

    SettingsProjectManager can bootstrap a blank temp workspace via SettingsFile.
    For project manager coverage, use ``real_project_manager`` which seeds a
    minimal project bundle.
    """
    with TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        setta_root = root / "setta_files"
        code_folder = setta_root / "code"
        artifacts_folder = setta_root / "artifacts"
        backup_folder = setta_root / "backups"

        for path in (code_folder, artifacts_folder, backup_folder):
            path.mkdir(parents=True, exist_ok=True)

        async with AsyncExitStack() as stack:
            stack.enter_context(
                temporary_setta_paths(
                    workspace_root=root,
                    setta_files_root=setta_root,
                )
            )

            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager)
            listener_registry = ListenerRegistry()
            python_script_sender = WMHPythonScriptSender(
                websocket_manager, listener_registry
            )
            dbe = DBE(setta_root)
            settings_file = SettingsFile(dbe, frontend_sender)

            specific_file_watcher = SpecificFileWatcher()
            artifacts = Artifacts(frontend_sender, specific_file_watcher, dbe)
            code_files = CodeFiles(frontend_sender, specific_file_watcher, dbe)
            json_source = JSONSource(
                frontend_sender, settings_file, specific_file_watcher, dbe
            )

            manager = SessionProjectManager(
                persistence_mode=SessionPersistenceMode.ide_settings,
                frontend_sender=frontend_sender,
                python_script_sender=python_script_sender,
                settings_file=settings_file,
                specific_file_watcher=specific_file_watcher,
                dbe=dbe,
                artifacts=artifacts,
                json_source=json_source,
                code_files=code_files,
            )

            stack.push_async_callback(_shutdown_manager, manager)
            await manager._process_queue_task_started.wait()

            stack.push_async_callback(
                _stop_specific_file_watcher, specific_file_watcher
            )

            fixture = SettingsManagerFixture(
                manager=manager,
                setta_root=setta_root,
                code_folder=code_folder,
                artifacts_folder=artifacts_folder,
                dbe=dbe,
                settings_file=settings_file,
                artifacts=artifacts,
                json_source=json_source,
                code_files=code_files,
                python_script_sender=python_script_sender,
                websocket_manager=websocket_manager,
                listener_registry=listener_registry,
            )

            yield fixture


@asynccontextmanager
async def real_project_manager() -> AsyncIterator[ProjectManagerFixture]:
    """Provision a SessionProjectManager (main) backed by a minimal project bundle."""
    with TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        setta_root = root / "setta_files"
        setta_root.mkdir(parents=True, exist_ok=True)

        code_folder = setta_root / "code"
        artifacts_folder = setta_root / "artifacts"
        backup_folder = setta_root / "backups"

        for path in (code_folder, artifacts_folder, backup_folder):
            path.mkdir(parents=True, exist_ok=True)

        _seed_minimal_setta_files(setta_root)

        async with AsyncExitStack() as stack:
            stack.enter_context(
                temporary_setta_paths(
                    workspace_root=root,
                    setta_files_root=setta_root,
                )
            )

            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager)
            listener_registry = ListenerRegistry()
            python_script_sender = WMHPythonScriptSender(
                websocket_manager, listener_registry
            )
            dbe = DBE(setta_root)
            settings_file = SettingsFile(dbe, frontend_sender)

            specific_file_watcher = SpecificFileWatcher()
            artifacts = Artifacts(frontend_sender, specific_file_watcher, dbe)
            code_files = CodeFiles(frontend_sender, specific_file_watcher, dbe)
            json_source = JSONSource(
                frontend_sender, settings_file, specific_file_watcher, dbe
            )

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
            )

            stack.push_async_callback(_shutdown_manager, manager)
            await manager._process_queue_task_started.wait()

            stack.push_async_callback(
                _stop_specific_file_watcher, specific_file_watcher
            )

            fixture = ProjectManagerFixture(
                manager=manager,
                setta_root=setta_root,
                code_folder=code_folder,
                artifacts_folder=artifacts_folder,
                dbe=dbe,
                settings_file=settings_file,
                artifacts=artifacts,
                json_source=json_source,
                code_files=code_files,
                python_script_sender=python_script_sender,
                websocket_manager=websocket_manager,
                listener_registry=listener_registry,
            )

            yield fixture


async def _shutdown_manager(manager: BaseProjectManager) -> None:
    # BaseProjectManager + WatchCodeManager use AsyncDebouncer, which in turn uses
    # spawn_background_task(). If we just cancel and drop references to those
    # tasks, they can be GC'd during loop shutdown and raise unraisable
    # contextvars errors. Capture and await them explicitly.
    background_tasks: set[asyncio.Task] = set()

    def collect_task(task: asyncio.Task | None) -> None:
        if task is not None:
            background_tasks.add(task)

    collect_task(getattr(manager, "queue_task", None))
    autosave = getattr(manager, "autosave_debouncer", None)
    if autosave is not None:
        collect_task(getattr(autosave, "_schedule_task", None))
        collect_task(getattr(autosave, "_task", None))

    watch_code = getattr(manager, "watch_code_manager", None)
    if watch_code is not None:
        for debouncer in getattr(watch_code, "_debouncers", {}).values():
            collect_task(getattr(debouncer, "_schedule_task", None))
            collect_task(getattr(debouncer, "_task", None))
        for debouncer in getattr(watch_code, "_delete_debouncers", {}).values():
            collect_task(getattr(debouncer, "_schedule_task", None))
            collect_task(getattr(debouncer, "_task", None))

    manager.shutdown()
    manager.autosave_debouncer.cancel_pending()

    while True:
        try:
            coroutine, future, frontend_op_id = manager.message_queue.get_nowait()
        except asyncio.QueueEmpty:
            break

        # We are tearing down the manager and won't run the queue to completion.
        # Close the coroutine to avoid "coroutine was never awaited" warnings.
        coroutine.close()
        if not future.done():
            future.cancel()
        manager._finalize_frontend_op(frontend_op_id, success=False)
        manager.message_queue.task_done()

    try:
        await manager.queue_task
    except asyncio.CancelledError:
        pass

    if background_tasks:
        await asyncio.gather(*background_tasks, return_exceptions=True)


async def _stop_specific_file_watcher(watcher: SpecificFileWatcher) -> None:
    watcher.stop()


DEFAULT_SAMPLE_PROJECT_NAME = "sample_project"
DEFAULT_SAMPLE_PROJECT_CONFIG_ID = ID("sample-project-config")
DEFAULT_SETTA_GEN_CONTENT = """class SettaState:
    def __init__(self) -> None:
        state = self
        state.placeholder = "Sample project placeholder"


state = SettaState()
"""

def _populate_project_fixture_files(setta_root: Path) -> None:
    _seed_minimal_setta_files(setta_root)
def _seed_minimal_setta_files(setta_root: Path) -> None:
    setta_root.mkdir(parents=True, exist_ok=True)
    _write_sample_project_json(setta_root / "project.json")
    _write_sample_settings_files(setta_root)
    _write_sample_llm_configs(setta_root)
    _write_sample_code_files(setta_root)


def _write_sample_project_json(dest: Path) -> None:
    project_state = _build_sample_project_state()
    dest.write_text(project_state.model_dump_json(indent=2))


def _write_sample_settings_files(setta_root: Path) -> None:
    settings_path = setta_root / "setta-settings.json"
    settings_project_path = setta_root / "setta-settings-project.json"
    settings_state = SettingsState()
    settings_path.write_text(settings_state.model_dump_json(indent=2))
    settings_project = create_settings_project_state(settings_path)
    settings_project_path.write_text(settings_project.model_dump_json(indent=2))


def _write_sample_llm_configs(setta_root: Path) -> None:
    dbe = DBE(setta_root)
    config = AllLLMConfigs(
        mcpServers={
            SETTA_MCP_SERVER_ID: MCPServerConfig(
                transport="sse",
                url=f"http://{C.DEFAULT_HOST}:{C.DEFAULT_PORT}/mcp",
            )
        },
        defaultMcpServerIds=[SETTA_MCP_SERVER_ID],
    )
    payload = config.model_dump(exclude_unset=True)
    dbe.write_llm_config(payload)
    dbe.write_llm_config_example(payload)


def _write_sample_code_files(setta_root: Path) -> None:
    sections_dir = setta_root / "code" / "sections" / DEFAULT_SAMPLE_PROJECT_NAME
    sections_dir.mkdir(parents=True, exist_ok=True)
    gen_path = sections_dir / "setta_gen.py"
    gen_path.write_text(DEFAULT_SETTA_GEN_CONTENT)


def _build_sample_project_state() -> ProjectStateBackend:
    project_config = ProjectConfig(
        id=DEFAULT_SAMPLE_PROJECT_CONFIG_ID,
        name=DEFAULT_SAMPLE_PROJECT_NAME,
    )
    return ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        defaultProjectConfigId=project_config.id,
    )
