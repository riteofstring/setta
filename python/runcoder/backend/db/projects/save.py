from ...schema import db
from ...utils.utils import create_new_id, generate_memorable_string
from ..codeInfo.save import save_code_info
from ..enteredValues.save import save_ev_cols
from ..sections.save import save_sections
from ..uiTypes.save import save_ui_type_cols, save_ui_types


def save_project_details(p):
    save_code_info(merge_configs(p, "codeInfo"))
    save_ev_cols(merge_configs(p, "evCols"))
    save_ui_types(merge_configs(p, "uiTypes"))
    save_ui_type_cols(merge_configs(p, "uiTypeCols"))
    save_sections(merge_configs(p, "sections"))
    save_project(p)
    save_project_configs(p["id"], p["configs"])
    update_default_project_config(p)


def save_project(project):
    with db:
        query = """
            INSERT OR REPLACE INTO Project (id, name)
            VALUES (:id, :name)
        """

        query_params = {"id": project["id"], "name": project["name"]}
        db.execute(query, query_params)


def save_project_configs(projectId, configs):
    with db:
        query = """
            INSERT OR REPLACE INTO ProjectConfig (id, name, projectId, x, y, zoom)
            VALUES (:id, :name, :projectId, :x, :y, :zoom)
        """

        query_params = []
        for c in configs:
            c = c["projectConfig"]
            query_params.append(
                {
                    "id": c["id"],
                    "name": c["name"],
                    "projectId": projectId,
                    **c["viewport"],
                }
            )
        db.executemany(query, query_params)

        placeholders = ", ".join(["?"] * len(configs))
        query = f"""
            DELETE FROM ProjectConfigChildren
            WHERE parentId IN ({placeholders})
        """
        query_params = [c["projectConfig"]["id"] for c in configs]
        db.execute(query, query_params)

        query = """
            INSERT INTO ProjectConfigChildren (parentId, childId, x, y, zIndex)
            VALUES (:parentId, :childId, :x, :y, :zIndex)
        """
        query_params = []
        for c in configs:
            c = c["projectConfig"]
            query_params.extend(
                [
                    {
                        "parentId": c["id"],
                        "childId": childId,
                        "x": details["x"],
                        "y": details["y"],
                        "zIndex": details["zIndex"],
                    }
                    for childId, details in c["children"].items()
                ]
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


# def


def create_project(name):
    query = """
        SELECT name
        FROM Project
    """
    db.execute(query)
    taken_names = [row[0] for row in db.fetchall()]

    while (not name) or name in taken_names:
        name = generate_memorable_string()

    with db:
        query = """
            INSERT INTO Project (id, name)
            VALUES (:id, :name)
        """
        projectId = create_new_id()
        query_params = {"id": projectId, "name": name}
        db.execute(query, query_params)

        query = """
            INSERT INTO ProjectConfig (id, name, projectId)
            VALUES (:id, :name, :projectId)
        """
        projectConfigId = create_new_id()
        query_params = {
            "id": projectConfigId,
            "name": "config1",
            "projectId": projectId,
        }
        db.execute(query, query_params)

        query = """
            UPDATE Project
            SET defaultConfigId = :defaultConfigId
            WHERE Project.id = :projectId
        """
        query_params = {"projectId": projectId, "defaultConfigId": projectConfigId}
        db.execute(query, query_params)

        query = """
            SELECT
                Project.id,
                Project.name,
                Project.defaultConfigId,
                ProjectConfig.id as configId,
                ProjectConfig.name as configName
            FROM
                Project
            JOIN
                ProjectConfig
            ON
                ProjectConfig.projectId = Project.id
            WHERE
                Project.id = :projectId
        """
        query_params = {"projectId": projectId}
        db.execute(query, query_params)
        out = dict(db.fetchone())
        out["configs"] = [{"id": out["configId"], "name": out["configName"]}]
        del out["configId"]
        del out["configName"]
        return out


def save_project_name(curr_name, new_name):
    with db:
        query = """
            UPDATE Project
            SET name = :new_name
            WHERE name = :curr_name
        """
        query_params = {"curr_name": curr_name, "new_name": new_name}
        db.execute(query, query_params)


def save_project_config_name(project_id, curr_name, new_name):
    with db:
        query = """
            UPDATE ProjectConfig
            SET name = :new_name
            WHERE
                name = :curr_name
            AND
                projectId = :projectId
        """
        query_params = {
            "projectId": project_id,
            "curr_name": curr_name,
            "new_name": new_name,
        }
        db.execute(query, query_params)


def merge_configs(p, key):
    output = {}
    for c in p["configs"]:
        output.update(c[key])
    return output
