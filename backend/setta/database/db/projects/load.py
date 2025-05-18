from setta.project_state.project_state import (
    AllProjectStates,
    ProjectConfig,
    ProjectState,
)


def load_all_project_states(db):
    query = """
        SELECT states 
        FROM AllProjectStates 
        WHERE id = 1
    """
    db.execute(query)
    row = db.fetchone()
    if not row or row[0] is None:
        return AllProjectStates()
    return AllProjectStates.model_validate_json(row[0])


def save_all_project_states(db, states: AllProjectStates):
    json_data = states.model_dump_json()
    query = """
        UPDATE AllProjectStates 
        SET states = :states 
        WHERE id = 1
    """
    db.execute(query, {"states": json_data})


def create_project_config(db, previewImgColor: str):
    existing_states = load_all_project_states(db)
    new_state = ProjectState(
        projectConfig=ProjectConfig(previewImgColor=previewImgColor)
    )

    project_id = new_state.projectConfig.id
    existing_states.projects[project_id] = new_state
    save_all_project_states(db, existing_states)
    return new_state.projectConfig.name
