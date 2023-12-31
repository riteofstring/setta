from ...schema import db
from ...utils.utils import convert_to_backend_format
from .copy import copy_project_details
from .save import save_project_details


def save_as_new_project_config(project, new_config_name):
    project_to_save = copy_project_details(
        project, new_config_name, do_create_new_id=True
    )
    save_project_details(convert_to_backend_format(project_to_save))
    return project_to_save


def save_as_existing_project_config(project, config_name):
    query = """
        SELECT *
        FROM ProjectConfig
        WHERE
            projectId = :projectId
        AND
            name = :name
    """

    db.execute(query, {"projectId": project["project"]["id"], "name": config_name})
    x = dict(db.fetchone())
    print(x)
    project["projectConfig"] = {
        **project["projectConfig"],
        "id": x["id"],
        "name": x["name"],
    }
    project_to_save = copy_project_details(project)
    save_project_details(convert_to_backend_format(project_to_save))
    return project_to_save
