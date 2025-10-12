import logging

from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.project_manager import ProjectManager
from setta.project_state.settings_project_manager import SettingsProjectManager
from setta.types.helpers_lvl2 import ProjectNotFound, confirm_config_name
from setta.types.project_state import ProjectStateSingleConfig

logger = logging.getLogger(__name__)


class ProjectManagerSwitcher:
    def __init__(
        self,
        project_manager: ProjectManager,
        settings_project_manager: SettingsProjectManager,
    ):
        self.main = project_manager
        self.settings = settings_project_manager

    def get(
        self, project_identifier: str | ProjectStateSingleConfig
    ) -> BaseProjectManager:
        project_id = (
            project_identifier
            if isinstance(project_identifier, str)
            else project_identifier.projectConfig.id
        )
        settings_default_id = self.settings.project_state_backend.defaultProjectConfigId
        manager = (
            self.settings if project_id == settings_default_id else self.main
        )
        logger.critical(
            "ProjectManagerSwitcher.get project_id=%s resolved_manager=%s settings_default_id=%s",
            project_id,
            manager.__class__.__name__,
            settings_default_id,
        )
        return manager

    def get_config_id_by_name(self, projectConfigName: str):
        projectConfigId = None
        for p in [self.main, self.settings]:
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
        return [self.main, self.settings]
