import json

from setta.database.utils import aggregate_results
from setta.utils.constants import PROJECT_CONFIG_TABLE_DATA_JSON_FIELDS
from setta.utils.utils import recursive_dict_merge

from ..codeInfo.load import load_code_info_cols
from ..runGroups.load import load_run_groups
from ..sections.load import (
    load_json_sources_into_data_structures,
    load_section_configs,
    load_sections,
)


class ProjectNotFound(Exception):
    pass


def load_all_project_config_metadata(db):
    query = """
        SELECT
            id,
            name,
            data
        FROM
            ProjectConfig
        ORDER BY
            ProjectConfig.id;
    """
    db.execute(query)
    output = []
    for row in db.fetchall():
        output.append({"id": row["id"], "name": row["name"], **json.loads(row["data"])})
    return output


def load_project_config_metadata(db, config_name):
    query = """
        SELECT
            ProjectConfig.id,
            ProjectConfig.name,
            ProjectConfig.shownRunGroup,
            ProjectConfig.data,
            ProjectConfigChildren.childId as childId,
            ProjectConfigChildren.x as childX,
            ProjectConfigChildren.y as childY,
            ProjectConfigChildren.zIndex as childZIndex
        FROM
            ProjectConfig
        LEFT JOIN
            ProjectConfigChildren
        ON
            ProjectConfig.id = ProjectConfigChildren.parentId
        WHERE
            name = :name
    """

    query_params = {"name": config_name}
    db.execute(query, query_params)
    out = aggregate_results(
        db.fetchall(), "id", ["childId", "childX", "childY", "childZIndex"]
    )
    if len(out) > 1:
        raise ValueError(f"output should be of length 1 but has length {len(out)}")
    if len(out) == 0:
        raise ProjectNotFound(f"{config_name} not found")
    out = list(out.values())[0]
    children = {}
    for i, c in enumerate(out["childId"]):
        if c:
            children[c] = {
                "x": out["childX"][i],
                "y": out["childY"][i],
                "zIndex": out["childZIndex"][i],
            }

    return {
        "id": out["id"],
        "name": out["name"],
        "children": children,
        "shownRunGroup": out["shownRunGroup"],
        **json.loads(out["data"]),
    }


def load_project_config(db, project_config_name):
    projectConfig = load_project_config_metadata(db, project_config_name)
    runGroups, projectConfig["runGroupSelection"] = load_run_groups(
        db, projectConfig["id"]
    )
    sections_data = load_sections(db, list(projectConfig["children"].keys()))
    sectionConfigs = load_section_configs(db, projectConfig["id"])
    sections = recursive_dict_merge(sections_data["sections"], sectionConfigs)
    sectionVariants = sections_data["sectionVariants"]
    uiTypeCols = sections_data["uiTypeCols"]
    paramSweeps = sections_data["paramSweeps"]
    uiTypes = sections_data["nonPresetUITypes"]
    codeInfo, codeInfoCols = load_code_info_cols(db, sectionVariants)
    jsonSourceMissing = load_json_sources_into_data_structures(
        sections, codeInfo, codeInfoCols, sectionVariants
    )

    return {
        "projectConfig": projectConfig,
        "sections": sections,
        "sectionVariants": sectionVariants,
        "uiTypes": uiTypes,
        "uiTypeCols": uiTypeCols,
        "paramSweeps": paramSweeps,
        "runGroups": runGroups,
        "codeInfo": codeInfo,
        "codeInfoCols": codeInfoCols,
        "jsonSourceMissing": jsonSourceMissing,
    }


def load_project_config_names(db, excludeProjectConfigName=None):
    query = """
        SELECT
            name
        FROM
            ProjectConfig
    """

    if excludeProjectConfigName:
        query += "WHERE name != :excludeProjectConfigName"

    db.execute(query, {"excludeProjectConfigName": excludeProjectConfigName})

    return [r[0] for r in db.fetchall()]


def load_full_project(db, excludeProjectConfigName=None):
    config_names = load_project_config_names(db, excludeProjectConfigName)
    configs = []
    for c in config_names:
        p = load_project_config(db, c)
        configs.append(p)

    return configs


def load_default_config_name(db):
    query = """
        SELECT name
        FROM ProjectConfig
        WHERE json_extract(data, '$.isDefault') = 1
    """

    db.execute(query)
    return db.fetchall()[0][0]
