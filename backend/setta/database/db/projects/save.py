from sqlalchemy.orm import Session

from setta.database.db.projects.load import (
    load_project_state_and_table,
    load_project_state_table,
)
from setta.types.project_state import ProjectConfig, ProjectState


class ProjectNameTaken(Exception):
    pass


def save_project_state(db: Session, state: ProjectState):
    table = load_project_state_table(db)
    table.state = state.model_dump()


def create_project_config(db: Session, previewImgColor: str):
    state, table = load_project_state_and_table(db)
    new_project_config = ProjectConfig(previewImgColor=previewImgColor)
    project_config_id = new_project_config.id
    state.projectConfigs[project_config_id] = new_project_config
    table.state = state.model_dump()
    return new_project_config.name


def save_project_config_name(db: Session, projectConfigId: str, newName: str):
    state, table = load_project_state_and_table(db)
    for k, v in state.projectConfigs.items():
        if k != projectConfigId and v.name == newName:
            raise ProjectNameTaken(f"{newName} is already taken")
    state.projectConfigs[projectConfigId].name = newName
    table.state = state.model_dump()


def set_as_default_project(db: Session, projectConfigId: str):
    state, table = load_project_state_and_table(db)
    state.defaultProjectConfigId = projectConfigId
    table.state = state.model_dump()
