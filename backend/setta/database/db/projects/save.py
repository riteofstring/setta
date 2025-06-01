from setta.database.db.projects.load import load_project_state
from setta.database.db_objs import DB
from setta.types.project_state import ProjectConfig, ProjectState


class ProjectNameTaken(Exception):
    pass


def save_project_state(db: DB, state: ProjectState):
    json_data = state.model_dump_json()
    query = """
        UPDATE ProjectState 
        SET state = :state
        WHERE id = 1
    """
    db.execute(query, {"state": json_data})


def create_project_config(db: DB, previewImgColor: str):
    state = load_project_state(db)
    new_project_config = ProjectConfig(previewImgColor=previewImgColor)

    project_config_id = new_project_config.id
    state.projectConfigs[project_config_id] = new_project_config
    save_project_state(db, state)
    return new_project_config.name


def save_project_config_name(db: DB, projectConfigId: str, newName: str):
    state = load_project_state(db)
    for k, v in state.projectConfigs.items():
        if k != projectConfigId and v.name == newName:
            raise ProjectNameTaken(f"{newName} is already taken")
    state.projectConfigs[projectConfigId].name = newName
    save_project_state(db, state)


def set_as_default_project(db: DB, projectConfigId: str):
    state = load_project_state(db)
    state.defaultProjectConfigId = projectConfigId
    save_project_state(db, state)
