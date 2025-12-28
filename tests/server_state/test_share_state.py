import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI

from setta.database.db_objs import DBE
from setta.project_state.share_project_manager import ShareProjectManager
from setta.server_state import SettaFastAPIState
from setta.share.session_store import MemorySessionStore
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend


def _write_share_project(root: Path) -> ProjectConfig:
    dbe = DBE(root)
    project_config = ProjectConfig(name="share_test")
    project_state = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        defaultProjectConfigId=project_config.id,
    )
    dbe.write_project(project_state)
    return project_config


class ShareStateTests(unittest.IsolatedAsyncioTestCase):
    async def test_share_state_boots_without_watchers(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            project_config = _write_share_project(root)
            app = FastAPI()
            state = SettaFastAPIState(
                app,
                share_mode=True,
                share_deployment_root=root,
            )

            await state.wait_until_ready()

            self.assertIsInstance(state.share_session_store, MemorySessionStore)
            self.assertIsInstance(state.share_project_manager, ShareProjectManager)
            self.assertEqual(
                project_config.id,
                state.share_project_manager.project_state_backend.defaultProjectConfigId,
            )
            self.assertFalse(state.specific_file_watcher)
            self.assertFalse(state.mcp_client)
            self.assertFalse(state.lsps)

    async def test_share_state_does_not_seed_settings_or_llm_files(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            _write_share_project(root)
            app = FastAPI()
            state = SettaFastAPIState(
                app,
                share_mode=True,
                share_deployment_root=root,
            )

            await state.wait_until_ready()

            self.assertFalse((root / "setta-settings.json").exists())
            self.assertFalse((root / "llm_config.example.json").exists())

    def test_share_state_requires_project_file(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            app = FastAPI()
            with self.assertRaises(FileNotFoundError):
                SettaFastAPIState(
                    app,
                    share_mode=True,
                    share_deployment_root=root,
                )
