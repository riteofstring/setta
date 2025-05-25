from setta.database.db.projects.load import load_project_state
from setta.project_state.project_state import ProjectConfig, ProjectState


def save_project_state(db, state: ProjectState):
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
    save_project_state(db, state)
    return new_project_config.name
