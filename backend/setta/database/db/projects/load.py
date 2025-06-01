from sqlalchemy.orm import Session

from setta.database.table_definitions import ProjectStateTable
from setta.types.project_state import (
    ProjectState,
)


class ProjectNotFound(Exception):
    pass


def load_project_state(db: Session):
    p = db.get(ProjectStateTable, 1)
    if not p:
        return ProjectState()
    return p.state


def load_project_state_and_confirm_config_name(db: Session, projectConfigName: str):
    state = load_project_state(db)
    for projectConfigId, p in state.projectConfigs.items():
        if projectConfigName == p.name:
            return projectConfigId, state

    raise ProjectNotFound


def load_project_metadata(db: Session):
    state = load_project_state(db)
    defaultProjectConfigId = state.defaultProjectConfigId
    projectMetadata = list(state.projectConfigs.values())
    return {
        "defaultProjectConfigId": defaultProjectConfigId,
        "projectMetadata": projectMetadata,
    }


def load_default_project_config_name(db: Session):
    state = load_project_state(db)
    if state.defaultProjectConfigId:
        return state.projectConfigs[state.defaultProjectConfigId].name
    return None
