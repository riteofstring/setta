from setta.database.utils import create_new_id, generate_memorable_string

from ..codeInfo.save import save_code_info
from ..paramSweeps.save import save_param_sweeps
from ..runGroups.save import save_run_groups
from ..sections.save import save_sections
from ..sectionVariants.save import save_section_variants
from ..uiTypes.save import save_ui_type_cols, save_ui_types


def save_project_details(dbs, p):
    save_code_info(dbs, p["codeInfo"])
    save_ui_types(dbs, p["uiTypes"])
    save_ui_type_cols(dbs, p["uiTypeCols"])
    save_param_sweeps(dbs, p["paramSweeps"])
    save_sections(dbs, p["sections"])
    save_section_variants(dbs, p["sections"], p["sectionVariants"])
    save_project(dbs, p["projectConfig"])
    save_section_configs(dbs, p["projectConfig"]["id"], p["sectionConfigs"])
    save_run_groups(dbs, p["runGroups"])


def save_project(dbs, project):
    db = dbs.default
    query = """
        INSERT INTO ProjectConfig (id, name, previewImgNodes, isDefault, x, y, zoom)
        VALUES (:id, :name, :previewImgNodes, :isDefault, :x, :y, :zoom)
        ON CONFLICT (id)
        DO UPDATE SET
        name = :name,
        previewImgNodes = :previewImgNodes,
        isDefault = :isDefault,
        x = :x,
        y = :y,
        zoom = :zoom
    """

    query_params = {
        "id": project["id"],
        "name": project["name"],
        "previewImgNodes": project["previewImgNodes"],
        "isDefault": project["isDefault"],
        **project["viewport"],
    }
    db.execute(query, query_params)

    if "previewImgColor" in project:
        query = """
            UPDATE ProjectConfig
            SET previewImgColor = :previewImgColor
            WHERE ID = :id
        """
        db.execute(
            query, {"id": project["id"], "previewImgColor": project["previewImgColor"]}
        )

    query = """
        DELETE FROM ProjectConfigChildren
        WHERE parentId = :parentId
    """
    db.execute(query, {"parentId": project["id"]})

    query = """
        INSERT INTO ProjectConfigChildren (parentId, childId, x, y, zIndex)
        VALUES (:parentId, :childId, :x, :y, :zIndex)
    """
    query_params = []
    query_params.extend(
        [
            {
                "parentId": project["id"],
                "childId": childId,
                "x": details["x"],
                "y": details["y"],
                "zIndex": details["zIndex"],
            }
            for childId, details in project["children"].items()
        ]
    )
    db.executemany(query, query_params)


def create_project_config(dbs, name, previewImgColor):
    db = dbs.default
    query = """
        SELECT name
        FROM ProjectConfig
    """
    db.execute(query)
    taken_names = [row[0] for row in db.fetchall()]

    while (not name) or name in taken_names:
        name = generate_memorable_string()

    query = """
        INSERT INTO ProjectConfig (id, name, previewImgColor)
        VALUES (:id, :name, :previewImgColor)
    """
    projectId = create_new_id()
    query_params = {"id": projectId, "name": name, "previewImgColor": previewImgColor}
    db.execute(query, query_params)

    query = """
        SELECT
            name
        FROM
            ProjectConfig
        WHERE
            id = :id
    """
    query_params = {"id": projectId}
    db.execute(query, query_params)
    out = dict(db.fetchone())
    return out["name"]


def save_project_config_name(dbs, curr_name, new_name):
    db = dbs.default
    query = """
        UPDATE ProjectConfig
        SET name = :new_name
        WHERE name = :curr_name
    """
    query_params = {"curr_name": curr_name, "new_name": new_name}
    db.execute(query, query_params)


def save_section_configs(dbs, project_config_id, section_configs):
    db = dbs.default

    query_params = []
    for section_id in section_configs.keys():
        query_params.extend([project_config_id, section_id])
    placeholders = ", ".join(["(?, ?)"] * (len(query_params) // 2))
    query = f"""
        DELETE FROM SectionConfig
        WHERE (projectConfigId, sectionId) IN ({placeholders})
    """
    db.execute(query, query_params)

    query = """
        INSERT INTO SectionConfig (projectConfigId, sectionId, width, height, variantId, paramSweepId, selectedItemId, versionsHeight, versionsVisible)
        VALUES (:projectConfigId, :sectionId, :width, :height, :variantId, :paramSweepId, :selectedItemId, :versionsHeight, :versionsVisible)
    """

    query_params = [
        {
            "projectConfigId": project_config_id,
            "sectionId": s["id"],
            "width": convert_size(s["size"]["width"]),
            "height": convert_size(s["size"]["height"]),
            "variantId": s["variantId"],
            "paramSweepId": s["paramSweepId"],
            "selectedItemId": s["selectedItem"],
            "versionsHeight": s["versionsHeight"],
            "versionsVisible": s["versionsVisible"],
        }
        for s in section_configs.values()
    ]

    db.executemany(query, query_params)


def convert_size(x):
    return -1 if x == "auto" else x
