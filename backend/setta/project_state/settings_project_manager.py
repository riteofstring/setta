from setta.project_state.history import History
from setta.project_state.project_manager import ProjectManager


class SettingsProjectManager(ProjectManager):
    def initialize_history(self):
        with self.dbe.session as db:
            return History(
                load_project_state(db),
            )

    def save(self):
        save(self.settings_file.settings, self.dbe, self.project_state_backend)
