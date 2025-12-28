import asyncio
import unittest
from datetime import timedelta
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.project_state.share_project_manager import ShareProjectManager
from setta.project_state.share_session_project_manager_switcher import (
    ShareSessionProjectManagerSwitcher,
)
from setta.share.session_cleanup import cleanup_expired_share_sessions
from setta.share.session_context import reset_share_session_id, set_share_session_id
from setta.share.session_store import MemorySessionStore
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.websocket_manager import WebsocketManager


def _write_share_project(root: Path) -> tuple[DBE, ProjectConfig]:
    dbe = DBE(root)
    project_config = ProjectConfig(name="share-session-cleanup")
    project_state = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        defaultProjectConfigId=project_config.id,
    )
    dbe.write_project(project_state)
    return dbe, project_config


class ShareSessionCleanupTests(unittest.IsolatedAsyncioTestCase):
    async def test_cleanup_removes_session_state_and_manager(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            dbe, _ = _write_share_project(root)
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager, share_mode=True)
            listener_registry = ListenerRegistry()
            python_script_sender = WMHPythonScriptSender(
                websocket_manager,
                listener_registry,
                None,
            )
            settings_file = SettingsFile(dbe, frontend_sender)
            share_project_manager = ShareProjectManager(
                dbe,
                root,
                frontend_sender,
            )
            session_store = MemorySessionStore(ttl_seconds=1)
            session = session_store.create_session()
            share_project_manager.create_session_state(session.id)

            switcher = ShareSessionProjectManagerSwitcher(
                share_project_manager,
                settings_file,
                python_script_sender,
            )
            token = set_share_session_id(session.id)
            try:
                manager = switcher.get(share_project_manager.project_config_id)
            finally:
                reset_share_session_id(token)
            await manager._process_queue_task_started.wait()

            session.last_accessed_at = session.last_accessed_at - timedelta(seconds=120)
            expired_ids = cleanup_expired_share_sessions(
                session_store,
                share_project_manager,
                switcher,
            )

            self.assertIn(session.id, expired_ids)
            self.assertFalse(share_project_manager.has_session_state(session.id))
            self.assertEqual([], switcher.project_managers)

            manager.queue_task.cancel()
            await asyncio.gather(manager.queue_task, return_exceptions=True)


if __name__ == "__main__":
    unittest.main()
