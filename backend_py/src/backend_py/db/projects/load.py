from collections import defaultdict

from ...schema import db
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
        SELECT id, name, x, y, zoom FROM ProjectConfig
        WHERE projectId = :projectId AND name = :name
    """
    query_params = {"projectId": project_id, "name": config_name}
    db.execute(query, query_params)
    return dict(db.fetchall()[0])


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
