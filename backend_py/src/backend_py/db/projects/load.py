from collections import defaultdict

from ...schema import db
from ...utils.utils import aggregate_join_results
from ..codeInfo.load import load_code_info_for_sections
from ..uiTypes.load import load_base_uitypes


def load_all_projects(format):
    query = """
        SELECT
            Project.id AS projectId,
            Project.name AS projectName,
            Project.defaultConfigId,
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

    db.execute(query)

    # Using a dictionary to collect configurations per project
    project_dict = defaultdict(
        lambda: {"id": None, "name": None, "defaultConfigId": None, "configs": []}
    )

    for row in db.fetchall():
        row_dict = dict(row)
        project_id = row_dict.pop("projectId")
        project_name = row_dict.pop("projectName")
        defaultConfigId = row_dict.pop("defaultConfigId")
        curr = project_dict[project_id]

        curr["id"] = project_id
        curr["name"] = project_name
        curr["defaultConfigId"] = defaultConfigId
        curr["configs"].append(row_dict)

    # Convert the dictionary to a list of project dictionaries
    projects_with_configs = list(project_dict.values())

    return projects_with_configs


def load_project_metadata(project_name):
    query = """
        SELECT * FROM Project
        WHERE name = :name
    """
    query_params = {"name": project_name}
    db.execute(query, query_params)
    return dict(db.fetchall()[0])


def load_project_config_metadata(project_id, config_name):
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
            projectId = :projectId
        AND
            name = :name
    """

    query_params = {"projectId": project_id, "name": config_name}
    db.execute(query, query_params)
    out = aggregate_join_results(
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


def load_project(project_name, config_name):
    project = load_project_metadata(project_name)
    projectConfig = load_project_config_metadata(project["id"], config_name)
    baseUITypes = load_base_uitypes()
    codeInfo = load_code_info_for_sections(baseUITypes)

    return {
        "project": project,
        "projectConfig": projectConfig,
        "sections": {},
        "evCols": {},
        "uiTypes": {**baseUITypes},
        "uiTypeCols": {},
        "codeInfo": codeInfo,
        "userCodeInfoMaps": {},
        "projectConfigCodeInfoMaps": {},
        "outputGroups": {},
        "outputs": {},
    }
