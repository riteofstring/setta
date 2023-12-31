import copy

from ...utils.utils import create_new_id
from ..sections.copy import copy_sections_and_other_info


def copy_project_details(project, new_config_name=None, do_create_new_id=False):
    new_info = copy_sections_and_other_info(project)
    new_project_config = copy_project_config(
        project["projectConfig"],
        new_config_name,
        do_create_new_id,
        new_info["section_id_map"],
    )

    return {
        **project,
        **new_info,
        "projectConfig": new_project_config,
    }


def copy_project_config(
    project_config, new_config_name=None, do_create_new_id=False, section_id_map=None
):
    new_project_config = copy.deepcopy(project_config)
    if new_config_name:
        new_project_config["name"] = new_config_name
    if do_create_new_id:
        new_project_config["id"] = create_new_id()
    if section_id_map:
        for section_id in list(new_project_config["children"].keys()):
            new_project_config["children"][
                section_id_map[section_id]
            ] = new_project_config["children"][section_id]
            del new_project_config["children"][section_id]
    return new_project_config
