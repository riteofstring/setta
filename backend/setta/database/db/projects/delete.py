from setta.database.db.projects.load import load_project_state
from setta.database.db.projects.save import save_project_state
from setta.database.db_objs import DB


def delete_project_configs(db: DB, project_config_ids: list[str]):
    project_state = load_project_state(db)
    for id in project_config_ids:
        del project_state.projectConfigs[id]
    save_project_state(db, project_state)
    return True
