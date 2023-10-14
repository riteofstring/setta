from ...utils.utils import convert_to_backend_format
from .copy import copy_project_details
from .save import save_project_details


def save_as_new_project_config(project, new_config_name):
    project_to_save = copy_project_details(
        project, new_config_name, do_create_new_id=True
    )
    save_project_details(convert_to_backend_format(project_to_save))
    return project_to_save
