import json

from setta.database.db.projects.utils import with_project_config_defaults
from setta.database.utils import aggregate_results
from setta.utils.utils import recursive_dict_merge

from ..codeInfo.load import load_code_info_cols
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
            pc.id,
            pc.name,
            pc.data,
            pcc.data AS child_data
        FROM
            ProjectConfig pc
        LEFT JOIN
            ProjectConfigChildren pcc ON pc.id = pcc.parentId
        ORDER BY
            pc.id;
    """
    db.execute(query)
    output = {}
    for row in db.fetchall():
        id = row["id"]
        if id not in output:
            output[id] = with_project_config_defaults(
                id=row["id"],
                name=row["name"],
                childrenForPreviewImg=[],
                **json.loads(row["data"]),
            )
        if row["child_data"]:
            output[id]["childrenForPreviewImg"].append(json.loads(row["child_data"]))

    default_name = load_default_config_name(db)
    return list(output.values()), default_name


def load_project_config_metadata(db, config_name):
    query = """
        SELECT
            ProjectConfig.id,
            ProjectConfig.name,
            ProjectConfig.data,
            ProjectConfigChildren.childId as childId,
            ProjectConfigChildren.data as childData
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
    out = aggregate_results(db.fetchall(), "id", ["childId", "childData"])
    if len(out) > 1:
        raise ValueError(f"output should be of length 1 but has length {len(out)}")
    if len(out) == 0:
        raise ProjectNotFound(f"{config_name} not found")
    out = list(out.values())[0]
    children = {}
    for i, c in enumerate(out["childId"]):
        if c:
            children[c] = json.loads(out["childData"][i])

    return {
        "id": out["id"],
        "name": out["name"],
        "children": children,
        **json.loads(out["data"]),
    }


def load_project_config(db, project_config_name):
    projectConfig = load_project_config_metadata(db, project_config_name)
    sections_data = load_sections(db, list(projectConfig["children"].keys()))
    sectionConfigs = load_section_configs(db, projectConfig["id"])
    sections = recursive_dict_merge(
        sections_data["sections"], sectionConfigs, strict_top_level_keys=True
    )
    sectionVariants = sections_data["sectionVariants"]
    uiTypeCols = sections_data["uiTypeCols"]
    uiTypes = sections_data["nonPresetUITypes"]
    codeInfo, codeInfoCols = load_code_info_cols(db, sectionVariants)
    load_json_sources_into_data_structures(
        sections, codeInfo, codeInfoCols, sectionVariants
    )

    return {
        "projectConfig": projectConfig,
        "sections": sections,
        "sectionVariants": sectionVariants,
        "uiTypes": uiTypes,
        "uiTypeCols": uiTypeCols,
        "codeInfo": codeInfo,
        "codeInfoCols": codeInfoCols,
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
        SELECT pc.name
        FROM Metadata m
        JOIN ProjectConfig pc ON m.defaultProject = pc.id
        WHERE m.id = 1;
    """

    db.execute(query)
    results = db.fetchall()
    if len(results) > 0:
        return results[0][0]
    return None
