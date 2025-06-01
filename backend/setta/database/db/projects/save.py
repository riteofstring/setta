from sqlalchemy import update
from sqlalchemy.orm import Session

from setta.database.db.projects.load import load_project_state
from setta.database.table_definitions import ProjectStateTable
from setta.types.project_state import ProjectConfig, ProjectState


class ProjectNameTaken(Exception):
    pass


def save_project_state(db: Session, state: ProjectState):
    json_data = state.model_dump()
    stmt = (
        update(ProjectStateTable)
        .where(ProjectStateTable.id == 1)
        .values(state=json_data)
    )
    db.execute(stmt)


def create_project_config(db: Session, previewImgColor: str):
    state = load_project_state(db)
    new_project_config = ProjectConfig(previewImgColor=previewImgColor)

    project_config_id = new_project_config.id
    state.projectConfigs[project_config_id] = new_project_config
    save_project_state(db, state)
    return new_project_config.name


def save_project_config_name(db: Session, projectConfigId: str, newName: str):
    state = load_project_state(db)
    for k, v in state.projectConfigs.items():
        if k != projectConfigId and v.name == newName:
            raise ProjectNameTaken(f"{newName} is already taken")
    state.projectConfigs[projectConfigId].name = newName
    save_project_state(db, state)


def set_as_default_project(db: Session, projectConfigId: str):
    state = load_project_state(db)
    state.defaultProjectConfigId = projectConfigId
    save_project_state(db, state)
