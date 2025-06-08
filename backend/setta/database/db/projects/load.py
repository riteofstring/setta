from sqlalchemy.orm import Session

from setta.database.table_definitions import ProjectStateTable
from setta.types.project_state import (
    ProjectState,
)


def load_project_state(db: Session):
    p = db.get(ProjectStateTable, 1)
    if not p or not p.state:
        return ProjectState()
    return ProjectState.model_validate(p.state)


def load_default_project_config_name(db: Session):
    state = load_project_state(db)
    if state.defaultProjectConfigId:
        return state.projectConfigs[state.defaultProjectConfigId].name
    return None
