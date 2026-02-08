import asyncio
import sys
from datetime import timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from types import ModuleType

import pytest
from setta.api.listener import SettaListener
from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.project_state.share_runtime_state import ShareRuntimeState
from setta.share.listener_runtime import ShareListenerRuntime, _ListenerHandle
from setta.server_state import cleanup_expired_share_sessions
from setta.share.session_store import MemorySessionStore
from setta.terminals.terminals import build_terminal_id
from setta.terminals.terminals import Terminals
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.types.share_deployment import DeploymentManifest, DeploymentType
from setta.types.id import ID
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.websocket_manager import WebsocketManager


def _build_share_deployment_root(
    tmpdir: str,
    project_config_name: str,
    deployment_version: str = "v1",
) -> Path:
    root = (
        Path(tmpdir)
        / "deployments"
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
) -> tuple[DBE, ProjectConfig]:
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
    return dbe, project_config


@pytest.mark.asyncio
class TestShareSessionCleanup:
    async def test_cleanup_removes_session_state_and_manager(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-session-cleanup"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            dbe, _ = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager, share_mode=True)
            listener_registry = ListenerRegistry()
            python_script_sender = WMHPythonScriptSender(
                websocket_manager,
                listener_registry,
                None,
            )
            settings_file = SettingsFile(dbe, frontend_sender, allow_write=False)
            share_runtime_state = ShareRuntimeState(
                dbe,
                root,
                frontend_sender,
            )
            share_runtime_state.initialize_share_state(settings_file)
            project_config_id = share_runtime_state.default_project_config_id
            session_store = MemorySessionStore(ttl_seconds=1)
            session = session_store.create_session()
            share_runtime_state.create_session_backend(session.id)

            switcher = ProjectManagerSwitcher(
                share_runtime_state=share_runtime_state,
                settings_file=settings_file,
                python_script_sender=python_script_sender,
                lsp_writers=None,
                frontend_sender=frontend_sender,
                specific_file_watcher=SpecificFileWatcher(),
            )
            manager = switcher.get(
                project_config_id,
                share_session_id=session.id,
            )
            await manager._process_queue_task_started.wait()

            session.last_accessed_at = session.last_accessed_at - timedelta(seconds=120)
            expired_ids = await cleanup_expired_share_sessions(
                session_store,
                share_runtime_state,
                switcher,
            )

            assert session.id in expired_ids
            assert not share_runtime_state.has_session_state(session.id)
            assert switcher.project_managers == []

            await asyncio.gather(manager.queue_task, return_exceptions=True)
            assert manager.queue_task.cancelled()

    async def test_cleanup_drops_listener_and_chat_state(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-session-cleanup"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            dbe, _ = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager, share_mode=True)
            settings_file = SettingsFile(dbe, frontend_sender, allow_write=False)
            share_runtime_state = ShareRuntimeState(
                dbe,
                root,
                frontend_sender,
            )
            share_runtime_state.initialize_share_state(settings_file)
            project_config_id = share_runtime_state.default_project_config_id
            session_store = MemorySessionStore(ttl_seconds=1)
            session = session_store.create_session()
            share_runtime_state.create_session_backend(session.id)

            listener_runtime = ShareListenerRuntime(
                deployment_root=root,
                manifest=None,
            )
            module_name = f"share_listener_{session.id}"
            module = ModuleType(module_name)
            sys.modules[module_name] = module
            listener = SettaListener(
                project_config_id=project_config_id,
                share_session_id=session.id,
            )

            async def _hold() -> None:
                await asyncio.sleep(3600)

            task = asyncio.create_task(_hold())
            listener_runtime._session_handles[(session.id, project_config_id)] = (
                _ListenerHandle(
                    listener=listener,
                    task=task,
                    module=module,
                )
            )
            assert (
                session.id,
                project_config_id,
            ) in listener_runtime._session_handles

            session.last_accessed_at = session.last_accessed_at - timedelta(seconds=120)
            expired_ids = await cleanup_expired_share_sessions(
                session_store,
                share_runtime_state,
                share_listener_runtime=listener_runtime,
            )

            assert session.id in expired_ids
            assert not session_store.has_session(session.id)
            assert not listener_runtime._session_handles
            assert module_name not in sys.modules

            await asyncio.gather(task, return_exceptions=True)

    async def test_cleanup_terminates_share_terminals(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-session-cleanup"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            dbe, _ = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager, share_mode=True)
            settings_file = SettingsFile(dbe, frontend_sender, allow_write=False)
            share_runtime_state = ShareRuntimeState(
                dbe,
                root,
                frontend_sender,
            )
            session_store = MemorySessionStore(ttl_seconds=1)
            session = session_store.create_session()
            share_runtime_state.create_session_backend(session.id)
            project_config_id = share_runtime_state.default_project_config_id

            terminals = Terminals(frontend_sender, settings_file)
            terminal_id = build_terminal_id(ID("terminal-section"), session.id)
            created = terminals.new_terminal(
                project_config_id,
                terminal_id,
                share_session_id=session.id,
            )
            assert created
            assert terminal_id in terminals.PTY_PIDS

            session.last_accessed_at = session.last_accessed_at - timedelta(seconds=120)
            expired_ids = await cleanup_expired_share_sessions(
                session_store,
                share_runtime_state,
                terminals=terminals,
            )

            assert session.id in expired_ids
            assert terminal_id not in terminals.PTY_PIDS
