from ...schema import db
from ..codeInfo.save import save_code_info
from ..enteredValues.save import save_ev_cols
from ..uiTypes.save import save_ui_types


def save_project_details(p):
    save_code_info(merge_configs(p, "codeInfo"))
    save_ev_cols(merge_configs(p, "evCols"))
    save_ui_types(merge_configs(p, "uiTypes"))
    save_project(p)
    save_project_configs(p["id"], p["configs"])
    update_default_project_config(p)


def save_project(project):
    with db:
        query = """
            INSERT INTO Project (id, name)
            VALUES (:id, :name)
            ON CONFLICT(id)
            DO UPDATE SET name = excluded.name;
        """

        query_params = {"id": project["id"], "name": project["name"]}
        db.execute(query, query_params)


def save_project_configs(projectId, configs):
    print()
    with db:
        query = """
            INSERT INTO ProjectConfig (id, name, projectId)
            VALUES (:id, :name, :projectId)
            ON CONFLICT(id)
            DO UPDATE SET name = excluded.name
        """

        query_params = []
        for c in configs:
            c = c["projectConfig"]
            query_params.append(
                {"id": c["id"], "name": c["name"], "projectId": projectId}
            )
        db.executemany(query, query_params)


def update_default_project_config(p):
    with db:
        query = """
            UPDATE Project
            SET defaultConfigId = :defaultConfigId
            WHERE ID = :id
        """

        query_params = {"id": p["id"], "defaultConfigId": p["defaultConfigId"]}
        db.execute(query, query_params)


def merge_configs(p, key):
    output = {}
    for c in p["configs"]:
        output.update(c[key])
    return output
