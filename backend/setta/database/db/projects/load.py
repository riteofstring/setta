from collections import defaultdict

from setta.database.utils import aggregate_results

from ..codeInfo.load import load_code_info_for_sections
from ..runGroups.load import load_run_groups
from ..sections.load import load_sections


def load_all_project_config_metadata(dbs):
    query = """
        SELECT
            id,
            name,
            previewImgNodes,
            previewImgColor
        FROM
            ProjectConfig
        ORDER BY
            ProjectConfig.id;
    """
    db = dbs.default
    db.execute(query)
    return [dict(row) for row in db.fetchall()]


def load_project_config_metadata(dbs, config_name):
    db = dbs.default
    query = """
        SELECT
            ProjectConfig.id,
            ProjectConfig.name,
            ProjectConfig.x,
            ProjectConfig.y,
            ProjectConfig.zoom,
            ProjectConfig.isDefault,
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
        "isDefault": out["isDefault"],
        "viewport": {"x": out["x"], "y": out["y"], "zoom": out["zoom"]},
        "children": children,
    }


def load_project_config(dbs, project_config_name):
    projectConfig = load_project_config_metadata(dbs, project_config_name)
    runGroups = load_run_groups(dbs, projectConfig["id"])
    sections_data = load_sections(dbs, list(projectConfig["children"].keys()))
    sections = sections_data["sections"]
    evCols = sections_data["evCols"]
    uiTypeCols = sections_data["uiTypeCols"]
    paramSweeps = sections_data["paramSweeps"]
    uiTypes = sections_data["nonPresetUITypes"]
    codeInfo = load_code_info_for_sections(dbs, uiTypes)

    return {
        "projectConfig": projectConfig,
        "sections": sections,
        "evCols": evCols,
        "uiTypes": uiTypes,
        "uiTypeCols": uiTypeCols,
        "paramSweeps": paramSweeps,
        "runGroups": runGroups,
        "codeInfo": codeInfo,
        "outputGroups": {},
        "outputs": {},
        "dbSourceMapping": dbs.db_source_mapping,
    }


def load_full_project(dbs):
    query = """
        SELECT
            name
        FROM
            ProjectConfig
    """
    db = dbs.default
    db.execute(query)

    config_names = [r[0] for r in db.fetchall()]
    configs = []
    for c in config_names:
        p = load_project_config(dbs, c)
        configs.append(p)

    return configs
