import copy

from ...utils.utils import create_new_id
from ..codeInfo.copy import copy_code_info
from ..enteredValues.copy import copy_ev_cols
from ..sections.copy import copy_sections
from ..uiTypes.copy import copy_ui_type_cols, copy_ui_types


def copy_project_details(project, new_config_name=None, do_create_new_id=False):
    new_code_info, code_info_id_map = copy_code_info(project["codeInfo"])
    new_ev_cols, ev_col_id_map = copy_ev_cols(project["evCols"], code_info_id_map)
    new_ui_types, ui_type_id_map = copy_ui_types(project["uiTypes"], code_info_id_map)
    new_ui_type_cols, ui_type_col_id_map = copy_ui_type_cols(
        project["uiTypeCols"], ui_type_id_map, code_info_id_map
    )
    new_sections, section_id_map = copy_sections(
        project["sections"],
        code_info_id_map,
        ev_col_id_map,
        ui_type_id_map,
        ui_type_col_id_map,
    )
    new_project_config = copy_project_config(
        project["projectConfig"], new_config_name, do_create_new_id, section_id_map
    )

    return {
        **project,
        "codeInfo": new_code_info,
        "evCols": new_ev_cols,
        "uiTypes": new_ui_types,
        "uiTypeCols": new_ui_type_cols,
        "sections": new_sections,
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
