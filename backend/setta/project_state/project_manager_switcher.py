from typing import TYPE_CHECKING

from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.code_files import CodeFiles
from setta.project_state.jsonSource.jsonSource import JSONSource
from setta.project_state.session_project_manager import (
    SessionPersistenceMode,
    SessionProjectManager,
)
from setta.runtime.scoped_sender import ScopedFrontendSender
from setta.share.session_context import require_share_session_id
from setta.types.helpers_lvl2 import ProjectNotFound, confirm_config_name
from setta.types.project_state import ProjectStateSingleConfig

if TYPE_CHECKING:
    from setta.database.settings_file import SettingsFile
    from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
    from setta.lsp.managers import LSPWriters
    from setta.project_state.share_project_manager import ShareProjectManager
    from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
    from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender


class ProjectManagerSwitcher:
    def __init__(
        self,
        *,
        main_manager: BaseProjectManager | None = None,
        settings_manager: BaseProjectManager | None = None,
        share_project_manager: "ShareProjectManager | None" = None,
        settings_file: "SettingsFile | None" = None,
        python_script_sender: "WMHPythonScriptSender | None" = None,
        lsp_writers: "LSPWriters | None" = None,
        frontend_sender: "WMHFrontendSender | None" = None,
        specific_file_watcher: "SpecificFileWatcher | None" = None,
    ):
        self.share_project_manager = share_project_manager
        self._session_managers: dict[str, SessionProjectManager] = {}
        if share_project_manager is not None:
            if settings_file is None:
                raise ValueError("share manager switcher missing settings_file")
            if python_script_sender is None:
                raise ValueError("share manager switcher missing python_script_sender")
            if frontend_sender is None:
                raise ValueError("share manager switcher missing frontend_sender")
            if specific_file_watcher is None:
                raise ValueError("share manager switcher missing file watcher")
            self.settings_file = settings_file
            self.python_script_sender = python_script_sender
            self.lsp_writers = lsp_writers
            self.frontend_sender = frontend_sender
            self.specific_file_watcher = specific_file_watcher
            self.main = None
            self.settings = None
        else:
            if main_manager is None or settings_manager is None:
                raise ValueError("IDE manager switcher missing managers")
            self.main = main_manager
            self.settings = settings_manager

    def get(
        self, project_identifier: str | ProjectStateSingleConfig
    ) -> BaseProjectManager:
        if self.share_project_manager is not None:
            share_session_id = require_share_session_id()
            manager = self.get_for_session(share_session_id)
            if isinstance(project_identifier, str):
                project_config_id = project_identifier
            else:
                project_config_id = project_identifier.projectConfig.id
            if project_config_id != self.share_project_manager.project_config_id:
                raise KeyError(f"Unknown share project config: {project_config_id}")
            return manager
        if isinstance(project_identifier, str):
            if self.settings is not None and (
                project_identifier
                == self.settings.project_state_backend.defaultProjectConfigId
            ):
                return self.settings
            if self.main is None:
                raise ProjectNotFound
            return self.main
        return self.get(project_identifier.projectConfig.id)

    def get_config_id_by_name(self, projectConfigName: str):
        if self.share_project_manager is not None:
            project_config_id = self.share_project_manager.project_config_id
            config = self.share_project_manager.project_state_backend.projectConfigs[
                project_config_id
            ]
            if config.name != projectConfigName:
                raise ProjectNotFound
            return project_config_id
        projectConfigId = None
        for p in [self.main, self.settings]:
            if p is None:
                continue
            try:
                projectConfigId = confirm_config_name(
                    p.project_state_backend, projectConfigName
                )
            except ProjectNotFound:
                pass
        if not projectConfigId:
            raise ProjectNotFound
        return projectConfigId

    @property
    def project_managers(self) -> list[BaseProjectManager]:
        if self.share_project_manager is not None:
            return list(self._session_managers.values())
        output: list[BaseProjectManager] = []
        if self.main is not None:
            output.append(self.main)
        if self.settings is not None:
            output.append(self.settings)
        return output

    def get_for_session(self, share_session_id: str) -> BaseProjectManager:
        if self.share_project_manager is None:
            if self.main is None:
                raise ProjectNotFound
            if not share_session_id:
                return self.main
            return self.main
        if not share_session_id:
            raise KeyError("Missing share session id")
        if share_session_id in self._session_managers:
            return self._session_managers[share_session_id]
        self.share_project_manager.get_or_create_session_state(share_session_id)
        scoped_sender = ScopedFrontendSender(self.frontend_sender, share_session_id)
        artifacts = self.share_project_manager.get_session_artifacts(share_session_id)
        json_source = JSONSource(
            scoped_sender,
            self.settings_file,
            self.specific_file_watcher,
            self.share_project_manager.dbe,
        )
        code_files = CodeFiles(
            scoped_sender,
            self.specific_file_watcher,
            self.share_project_manager.dbe,
        )
        manager = SessionProjectManager(
            persistence_mode=SessionPersistenceMode.share,
            frontend_sender=self.frontend_sender,
            python_script_sender=self.python_script_sender,
            settings_file=self.settings_file,
            specific_file_watcher=self.specific_file_watcher,
            dbe=self.share_project_manager.dbe,
            artifacts=artifacts,
            json_source=json_source,
            code_files=code_files,
            lsp_writers=self.lsp_writers,
            share_project_manager=self.share_project_manager,
            share_session_id=share_session_id,
        )
        self._session_managers[share_session_id] = manager
        return manager

    def drop_session_manager(self, share_session_id: str) -> None:
        if self.share_project_manager is None:
            return
        manager = self._session_managers.pop(share_session_id, None)
        if manager is None:
            return
        manager.shutdown()

    @property
    def main(self) -> BaseProjectManager:
        if self.share_project_manager is not None:
            share_session_id = require_share_session_id()
            return self.get_for_session(share_session_id)
        if self._main is None:
            raise ProjectNotFound
        return self._main

    @main.setter
    def main(self, value: BaseProjectManager | None) -> None:
        self._main = value

    @property
    def settings(self) -> BaseProjectManager | None:
        return self._settings

    @settings.setter
    def settings(self, value: BaseProjectManager | None) -> None:
        self._settings = value
