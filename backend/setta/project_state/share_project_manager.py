from pathlib import Path

from setta.database.db_objs import DBE
from setta.types.project_state import ProjectStateBackend


class ShareProjectManager:
    def __init__(self, dbe: DBE, deployment_root: Path) -> None:
        self.dbe = dbe
        self.deployment_root = deployment_root
        self.project_state_backend = self.load_initial_state()

    def load_initial_state(self) -> ProjectStateBackend:
        return self.dbe.read_project()
