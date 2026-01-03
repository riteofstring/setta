from typing import TYPE_CHECKING, Union

from setta.project_state.share_session_project_manager import ShareSessionProjectManager
from setta.share.session_context import require_share_session_id
from setta.types.helpers_lvl2 import ProjectNotFound

if TYPE_CHECKING:
    from setta.database.settings_file import SettingsFile
    from setta.lsp.managers import LSPWriters
    from setta.project_state.share_project_manager import ShareProjectManager
    from setta.types.project_state import ProjectStateSingleConfig
    from setta.websockets.msg_handlers.python_script_sender import (
        WMHPythonScriptSender,
    )


class ShareSessionProjectManagerSwitcher:
    def __init__(
        self,
        share_project_manager: "ShareProjectManager",
        settings_file: "SettingsFile",
        python_script_sender: "WMHPythonScriptSender",
        lsp_writers: "LSPWriters | None" = None,
    ) -> None:
        self.share_project_manager = share_project_manager
        self.settings_file = settings_file
        self.python_script_sender = python_script_sender
        self.lsp_writers = lsp_writers
        self._session_managers: dict[str, ShareSessionProjectManager] = {}

    def _get_or_create_manager(
        self, share_session_id: str
    ) -> ShareSessionProjectManager:
        if share_session_id in self._session_managers:
            return self._session_managers[share_session_id]
        manager = ShareSessionProjectManager(
            share_project_manager=self.share_project_manager,
            share_session_id=share_session_id,
            settings_file=self.settings_file,
            python_script_sender=self.python_script_sender,
            lsp_writers=self.lsp_writers,
        )
        self._session_managers[share_session_id] = manager
        return manager

    def drop_session_manager(self, share_session_id: str) -> None:
        manager = self._session_managers.pop(share_session_id, None)
        if manager is None:
            return
        manager.shutdown()

    def get(
        self,
        project_identifier: Union[str, "ProjectStateSingleConfig"],
    ) -> ShareSessionProjectManager:
        share_session_id = require_share_session_id()
        if isinstance(project_identifier, str):
            project_config_id = project_identifier
        else:
            project_config_id = project_identifier.projectConfig.id
        if project_config_id != self.share_project_manager.project_config_id:
            raise KeyError(f"Unknown share project config: {project_config_id}")
        self.share_project_manager.get_or_create_session_state(share_session_id)
        return self._get_or_create_manager(share_session_id)

    def get_config_id_by_name(self, projectConfigName: str) -> str:
        project_config_id = self.share_project_manager.project_config_id
        config = self.share_project_manager.project_state_backend.projectConfigs[
            project_config_id
        ]
        if config.name != projectConfigName:
            raise ProjectNotFound
        return project_config_id

    @property
    def main(self) -> ShareSessionProjectManager:
        return self.get(self.share_project_manager.project_config_id)

    @property
    def project_managers(self) -> list[ShareSessionProjectManager]:
        return list(self._session_managers.values())
