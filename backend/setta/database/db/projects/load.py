from sqlalchemy.orm import Session

from setta.database.table_definitions import ProjectStateTable
from setta.types.project_state import (
    ProjectStateBackend,
)


def load_project_state(db: Session):
    p = db.get(ProjectStateTable, 1)
    if not p or not p.state:
        return ProjectStateBackend()
    return ProjectStateBackend(**p.state)
