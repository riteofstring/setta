from collections import defaultdict

from runcoder.database.utils import aggregate_results

from ..codeInfo.load import load_code_info_for_sections
from ..runGroups.load import load_run_groups
from ..sections.load import load_sections
from ..uiTypes.load import load_base_uitypes
from .utils import convert_to_file_menu_format


def load_all_projects(dbs, format, input_project_id):
    query = """
        SELECT
            Project.id AS projectId,
            Project.name AS projectName,
            Project.defaultConfigId,
            Project.previewImg,
            ProjectConfig.*
        FROM
            Project
        JOIN
            ProjectConfig
        ON
            ProjectConfig.projectId = Project.id
        ORDER BY
            Project.id;
    """
    db = dbs.default
    db.execute(query)

    # Using a dictionary to collect configurations per project
    project_dict = defaultdict(
        lambda: {"id": None, "name": None, "defaultConfigId": None, "previewImg": None, "configs": []}
    )

    for row in db.fetchall():
        row_dict = dict(row)
        project_id = row_dict.pop("projectId")
        project_name = row_dict.pop("projectName")
        defaultConfigId = row_dict.pop("defaultConfigId")
        previewImg = row_dict.pop("previewImg")
        curr = project_dict[project_id]

        curr["id"] = project_id
        curr["name"] = project_name
        curr["defaultConfigId"] = defaultConfigId
        curr["previewImg"] = previewImg
        curr["configs"].append(row_dict)

    # Convert the dictionary to a list of project dictionaries
    projects_with_configs = list(project_dict.values())

    if format == "fileMenu":
        return convert_to_file_menu_format(projects_with_configs, input_project_id)

    return projects_with_configs


def load_project_metadata(dbs, project_name):
    db = dbs.default
    query = """
        SELECT * FROM Project
        WHERE name = :name
    """
    query_params = {"name": project_name}
    db.execute(query, query_params)
    return dict(db.fetchone())


def load_project_config_metadata(dbs, project_id, config_name):
    db = dbs.default
    query = """
        SELECT
            ProjectConfig.id,
            ProjectConfig.name,
            ProjectConfig.x,
            ProjectConfig.y,
            ProjectConfig.zoom,
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
            ProjectConfig.projectId = :projectId
        AND
            name = :name
    """

    query_params = {"projectId": project_id, "name": config_name}
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
        "viewport": {"x": out["x"], "y": out["y"], "zoom": out["zoom"]},
        "children": children,
    }


def load_project(dbs, project_name, config_name):
    project = load_project_metadata(dbs, project_name)
    projectConfig = load_project_config_metadata(dbs, project["id"], config_name)
    runGroups = load_run_groups(dbs, projectConfig["id"])
    sections_data = load_sections(dbs, list(projectConfig["children"].keys()))
    sections = sections_data["sections"]
    evCols = sections_data["evCols"]
    uiTypeCols = sections_data["uiTypeCols"]
    paramSweeps = sections_data["paramSweeps"]
    baseUITypes = load_base_uitypes(dbs)
    uiTypes = {**baseUITypes, **sections_data["nonPresetUITypes"]}
    codeInfo = load_code_info_for_sections(dbs, uiTypes)

    return {
        "project": project,
        "projectConfig": projectConfig,
        "sections": sections,
        "evCols": evCols,
        "uiTypes": uiTypes,
        "uiTypeCols": uiTypeCols,
        "paramSweeps": paramSweeps,
        "runGroups": runGroups,
        "codeInfo": codeInfo,
        "userCodeInfoMaps": {},
        "projectConfigCodeInfoMaps": {},
        "outputGroups": {},
        "outputs": {},
        "dbSourceMapping": dbs.db_source_mapping,
    }


def load_full_project(dbs, project_name, with_base_uitypes=False):
    query = """
        SELECT
            ProjectConfig.name as configName
        FROM
            ProjectConfig
        JOIN
            Project
        ON
            ProjectConfig.projectId = Project.id
        WHERE
            Project.name = :projectName
    """
    db = dbs.default
    db.execute(query, {"projectName": project_name})

    config_names = [r[0] for r in db.fetchall()]
    configs = []
    project = None
    for c in config_names:
        p = load_project(dbs, project_name, c)
        project = p.pop("project")
        if not with_base_uitypes:
            p["uiTypes"] = {
                k: v for k, v in p["uiTypes"].items() if v["presetType"] != "BASE"
            }
        configs.append(p)

    output = {**project, "configs": configs}
    return output
