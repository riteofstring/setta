from setta.project_state.project_manager import ProjectManager
from setta.project_state.settings_project_manager import SettingsProjectManager


class ProjectManagerSwitcher:
    def __init__(
        self,
        project_manager: ProjectManager,
        settings_project_manager: SettingsProjectManager,
    ):
        self.project_manager = project_manager
        self.settings_project_manager = settings_project_manager

    def get(self, projectConfigId: str):
        if (
            projectConfigId
            == self.settings_project_manager.project_state_backend.defaultProjectConfigId
        ):
            return self.settings_project_manager
        return self.project_manager
