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

