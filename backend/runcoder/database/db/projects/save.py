from runcoder.database.utils import create_new_id, generate_memorable_string

from ..codeInfo.save import save_code_info
from ..enteredValues.save import save_ev_cols
from ..paramSweeps.save import save_param_sweeps
from ..runGroups.save import save_run_groups
from ..sections.save import save_sections
from ..uiTypes.save import save_ui_type_cols, save_ui_types


def save_project_details(dbs, p, withPreviewImgColor=False):
    save_code_info(dbs, merge_configs(p, "codeInfo"), merge_configs(p, "evCols"))
    save_ev_cols(dbs, merge_configs(p, "evCols"))
    save_ui_types(dbs, merge_configs(p, "uiTypes"))
    save_ui_type_cols(dbs, merge_configs(p, "uiTypeCols"))
    save_param_sweeps(dbs, merge_configs(p, "paramSweeps"))
    save_sections(dbs, merge_configs(p, "sections"))
    save_project(dbs, p, withPreviewImgColor)
    save_project_configs(dbs, p["id"], p["configs"])
    save_run_groups(dbs, merge_configs(p, "runGroups"))
    update_default_project_config(dbs, p)


def save_project(dbs, project, withPreviewImgColor=False):
    db = dbs.default
    query = """
        INSERT INTO Project (id, name, previewImg)
        VALUES (:id, :name, :previewImg)
        ON CONFLICT (id)
        DO UPDATE SET
        name = :name,
        previewImg = :previewImg
    """

    query_params = {
        "id": project["id"],
        "name": project["name"],
        "previewImg": project["previewImg"],
    }
    db.execute(query, query_params)

    if withPreviewImgColor:
        query = """
            UPDATE Project
            SET previewImgColor = :previewImgColor
            WHERE ID = :id
        """
        db.execute(
            query, {"id": project["id"], "previewImgColor": project["previewImgColor"]}
        )


def save_project_configs(dbs, projectId, configs):
    db = dbs.default
    query = """
        INSERT INTO ProjectConfig (id, name, projectId, x, y, zoom)
        VALUES (:id, :name, :projectId, :x, :y, :zoom)
        ON CONFLICT (id)
        DO UPDATE SET
            name = :name,
            projectId = :projectId,
            x = :x,
            y = :y,
            zoom = :zoom
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
    print(query_params, flush=True)
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


def update_default_project_config(dbs, p):
    db = dbs.default
    query = """
        UPDATE Project
        SET defaultConfigId = :defaultConfigId
        WHERE ID = :id
    """

    query_params = {"id": p["id"], "defaultConfigId": p["defaultConfigId"]}
    db.execute(query, query_params)


def create_project(dbs, name, previewImgColor):
    db = dbs.default
    query = """
        SELECT name
        FROM Project
    """
    db.execute(query)
    taken_names = [row[0] for row in db.fetchall()]

    while (not name) or name in taken_names:
        name = generate_memorable_string()

    query = """
        INSERT INTO Project (id, name, previewImgColor)
        VALUES (:id, :name, :previewImgColor)
    """
    projectId = create_new_id()
    query_params = {"id": projectId, "name": name, "previewImgColor": previewImgColor}
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


def save_project_name(dbs, curr_name, new_name):
    db = dbs.default
    query = """
        UPDATE Project
        SET name = :new_name
        WHERE name = :curr_name
    """
    query_params = {"curr_name": curr_name, "new_name": new_name}
    db.execute(query, query_params)


def save_project_config_name(dbs, project_id, curr_name, new_name):
    db = dbs.default
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
