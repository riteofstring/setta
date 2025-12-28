import asyncio
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.project_state.share_project_manager import ShareProjectManager
from setta.project_state.share_session_project_manager_switcher import (
    ShareSessionProjectManagerSwitcher,
)
from setta.share.session_context import reset_share_session_id, set_share_session_id
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.websocket_manager import WebsocketManager


def _write_share_project(root: Path) -> ProjectConfig:
    dbe = DBE(root)
    project_config = ProjectConfig(name="share-switcher-test")
    project_state = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        defaultProjectConfigId=project_config.id,
    )
    dbe.write_project(project_state)
    return project_config


def _build_switcher(
    root: Path,
) -> tuple[ShareSessionProjectManagerSwitcher, ShareProjectManager]:
    websocket_manager = WebsocketManager()
    frontend_sender = WMHFrontendSender(websocket_manager, share_mode=True)
    dbe = DBE(root)
    share_manager = ShareProjectManager(dbe, root, frontend_sender)
    settings_file = SettingsFile(dbe, frontend_sender)
    python_sender = WMHPythonScriptSender(
        websocket_manager,
        ListenerRegistry(),
    )
    switcher = ShareSessionProjectManagerSwitcher(
        share_manager,
        settings_file,
        python_sender,
    )
    return switcher, share_manager


class ShareSessionProjectManagerSwitcherTests(unittest.IsolatedAsyncioTestCase):
    async def test_switcher_requires_session_context(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            _write_share_project(root)
            switcher, share_manager = _build_switcher(root)

            with self.assertRaises(KeyError):
                switcher.get(share_manager.project_config_id)

    async def test_switcher_scopes_managers_by_session(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            project_config = _write_share_project(root)
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
