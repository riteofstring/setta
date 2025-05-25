from setta.project_state.project_state import (
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
    for projectConfigId, p in state.projectConfigs.items():
        if projectConfigName == p.name:
            return projectConfigId, state

    raise ProjectNotFound


def load_project_metadata(db):
    state = load_project_state(db)
    defaultProjectConfigId = state.defaultProjectConfigId
    projectMetadata = list(state.projectConfigs.values())
    return {
        "defaultProjectConfigId": defaultProjectConfigId,
        "projectMetadata": projectMetadata,
    }


def load_default_project_config_name(db):
    state = load_project_state(db)
    if state.defaultProjectConfigId:
        return state.projectConfigs[state.defaultProjectConfigId].name
    return None
