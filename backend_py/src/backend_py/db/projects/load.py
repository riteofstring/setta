from collections import defaultdict

from ...schema import db


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
