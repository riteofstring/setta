import asyncio
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.project_state.share_project_manager import ShareProjectManager
from setta.share.session_context import reset_share_session_id, set_share_session_id
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.types.share_deployment import ShareDeploymentManifest
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
) -> ProjectConfig:
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
    return project_config


def _build_switcher(
    root: Path,
) -> tuple[ProjectManagerSwitcher, ShareProjectManager]:
    websocket_manager = WebsocketManager()
    frontend_sender = WMHFrontendSender(websocket_manager, share_mode=True)
    dbe = DBE(root)
    share_manager = ShareProjectManager(dbe, root, frontend_sender)
    settings_file = SettingsFile(dbe, frontend_sender, allow_write=False)
    share_manager.initialize_share_state(settings_file)
    python_sender = WMHPythonScriptSender(
        websocket_manager,
        ListenerRegistry(),
    )
    switcher = ProjectManagerSwitcher(
        share_project_manager=share_manager,
        settings_file=settings_file,
        python_script_sender=python_sender,
        lsp_writers=None,
        frontend_sender=frontend_sender,
        specific_file_watcher=SpecificFileWatcher(),
    )
    return switcher, share_manager


class ShareSessionProjectManagerSwitcherTests(unittest.IsolatedAsyncioTestCase):
    async def test_switcher_requires_session_context(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-switcher-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            switcher, share_manager = _build_switcher(root)

            with self.assertRaises(KeyError):
                switcher.get(share_manager.project_config_id)

    async def test_switcher_scopes_managers_by_session(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-switcher-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            switcher, _share_manager = _build_switcher(root)

            token_a = set_share_session_id("session-a")
            try:
                manager_a = switcher.get(project_config.id)
                self.assertIs(manager_a, switcher.get(project_config.id))
            finally:
                reset_share_session_id(token_a)

            token_b = set_share_session_id("session-b")
            try:
                manager_b = switcher.get(project_config.id)
                self.assertIsNot(manager_a, manager_b)
            finally:
                reset_share_session_id(token_b)

            await manager_a._process_queue_task_started.wait()
            await manager_b._process_queue_task_started.wait()

            manager_a.queue_task.cancel()
            manager_b.queue_task.cancel()
            results = await asyncio.gather(
                manager_a.queue_task,
                manager_b.queue_task,
                return_exceptions=True,
            )
            self.assertEqual(2, len(results))
            self.assertIsInstance(results[0], asyncio.CancelledError)
            self.assertIsInstance(results[1], asyncio.CancelledError)


if __name__ == "__main__":
    unittest.main()
