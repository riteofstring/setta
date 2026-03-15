import asyncio
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
import pytest_asyncio
from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.project_state.artifacts import Artifacts
from setta.project_state.code_files import CodeFiles
from setta.project_state.jsonSource.jsonSource import JSONSource
from setta.project_state.session_project_manager import (
    SessionPersistenceMode,
    SessionProjectManager,
)
from setta.types.generated.settings_state import SettingsState
from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.utils.paths import normalize_state_path
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.websocket_manager import WebsocketManager

from tests.utils.manager_fixture import _shutdown_manager


@pytest.mark.asyncio
class TestFileWatcherCategory:
    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self) -> None:
        self._tmp_dir = TemporaryDirectory()
        self.root = Path(self._tmp_dir.name)
        self.setta_root = self.root / "setta_files"
        self.setta_root.mkdir(parents=True, exist_ok=True)

        self.dbe = DBE(self.setta_root)
        self._seed_project_state()
        self._seed_settings()

        self.websocket_manager = WebsocketManager()
        self.frontend_sender = WMHFrontendSender(self.websocket_manager)
        self.listener_registry = ListenerRegistry()
        self.python_script_sender = WMHPythonScriptSender(
            self.websocket_manager,
            self.listener_registry,
            self.dbe,
        )
        self.settings_file = SettingsFile(self.dbe, self.frontend_sender)

        loop = asyncio.get_running_loop()
        self.specific_file_watcher = SpecificFileWatcher(loop=loop)
        self.artifacts = Artifacts(
            self.frontend_sender, self.specific_file_watcher, self.dbe
        )
        self.code_files = CodeFiles(
            self.frontend_sender, self.specific_file_watcher, self.dbe
        )
        self.json_source = JSONSource(
            self.frontend_sender,
            self.settings_file,
            self.specific_file_watcher,
            self.dbe,
        )

        self.settings_manager = SessionProjectManager(
            persistence_mode=SessionPersistenceMode.ide_settings,
            frontend_sender=self.frontend_sender,
            settings_file=self.settings_file,
            specific_file_watcher=self.specific_file_watcher,
            dbe=self.dbe,
            artifacts=self.artifacts,
            json_source=self.json_source,
            code_files=self.code_files,
            lsp_writers=None,
        )
        self.main_manager = SessionProjectManager(
            persistence_mode=SessionPersistenceMode.ide_main,
            frontend_sender=self.frontend_sender,
            settings_file=self.settings_file,
            specific_file_watcher=self.specific_file_watcher,
            dbe=self.dbe,
            artifacts=self.artifacts,
            json_source=self.json_source,
            code_files=self.code_files,
            lsp_writers=None,
        )

        yield

        await _shutdown_manager(self.settings_manager)
        await _shutdown_manager(self.main_manager)
        self._tmp_dir.cleanup()

    def _seed_project_state(self) -> None:
        project_config = ProjectConfig(id=ID("main-config"), name="main")
        project_state = ProjectStateBackend(
            projectConfigs={project_config.id: project_config},
            projectChatWindowingByProjectConfigId={project_config.id: {}},
            defaultProjectConfigId=project_config.id,
        )
        self.dbe.write_project(project_state)

    def _seed_settings(self) -> None:
        settings_state = SettingsState()
        self.dbe.write_json(self.dbe.settings, settings_state.model_dump(mode="json"))

    async def test_json_source_callbacks_are_isolated_per_manager(self) -> None:
        settings_category = (
            f"{self.settings_manager._file_watcher_category_prefix}_JSONSource"
        )
        main_category = f"{self.main_manager._file_watcher_category_prefix}_JSONSource"
        assert settings_category != main_category

        settings_path = normalize_state_path(self.dbe.settings)
        callbacks = self.specific_file_watcher.callbacks
        assert settings_category in callbacks
        assert main_category in callbacks
        assert settings_path in callbacks[settings_category]

        self.main_manager.watch_json_source_files()

        callbacks_after = self.specific_file_watcher.callbacks
        assert settings_path in callbacks_after[settings_category]
