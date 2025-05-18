from setta.project_state.project_state import (
    ProjectConfig,
    ProjectState,
)


class ProjectNotFound(Exception):
    pass


def load_project_state(db):
    query = """
        SELECT state
        FROM ProjectState 
        WHERE id = 1
    """
    db.execute(query)
    row = db.fetchone()
    if not row or row[0] is None:
        return ProjectState()
    return ProjectState.model_validate_json(row[0])


def load_project_state_and_confirm_config_name(db, projectConfigName: str):
    state = load_project_state(db)
    for p in state.projectConfigs.values():
        if projectConfigName == p.name:
            return state

    raise ProjectNotFound


def load_project_metadata(db):
    state = load_project_state(db)
    defaultProjectConfigId = state.defaultProjectConfigId
    projectMetadata = list(state.projectConfigs.values())
    return {
        "defaultProjectConfigId": defaultProjectConfigId,
        "projectMetadata": projectMetadata,
    }


def save_all_project_states(db, state: ProjectState):
    json_data = state.model_dump_json()
    query = """
        UPDATE ProjectState 
        SET state = :state
        WHERE id = 1
    """
    db.execute(query, {"state": json_data})


def create_project_config(db, previewImgColor: str):
    state = load_project_state(db)
    new_project_config = ProjectConfig(previewImgColor=previewImgColor)

    project_config_id = new_project_config.id
    state.projectConfigs[project_config_id] = new_project_config
    save_all_project_states(db, state)
    return new_project_config.name
