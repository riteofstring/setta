from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.project_manager import ProjectManager
from setta.project_state.settings_project_manager import SettingsProjectManager
from setta.types.helpers import ProjectNotFound, confirm_config_name
from setta.types.project_state import ProjectStateSingleConfig


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
        if isinstance(project_identifier, str):
            if (
                project_identifier
                == self.settings.project_state_backend.defaultProjectConfigId
            ):
                return self.settings
            return self.main
        return self.get(project_identifier.projectConfig.id)

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
