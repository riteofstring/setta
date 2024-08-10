from setta.database.utils import remap_ids, rename_keys

from ..codeInfo.copy import copy_code_info
from ..sectionVariants.copy import copy_ev_cols
from ..uiTypes.copy import copy_ui_type_cols, copy_ui_types


def copy_sections(
    sections, code_info_id_map, ev_col_id_map, ui_type_id_map, ui_type_col_id_map
):
    new_sections, section_id_map = remap_ids(sections)
    for section in new_sections.values():
        section["id"] = section_id_map[section["id"]]
        section["children"] = [section_id_map[x] for x in section["children"]]
        if section.get("selectedItem"):
            section["selectedItem"] = code_info_id_map[section["selectedItem"]]
        section["evColId"] = ev_col_id_map[section["evColId"]]
        section["uiTypeId"] = ui_type_id_map[section["uiTypeId"]]
        section["uiTypeColId"] = ui_type_col_id_map[section["uiTypeColId"]]
        section["evColIds"] = [ev_col_id_map[x] for x in section["evColIds"]]
        section["nonPresetUITypeIds"] = [
            ui_type_id_map[x] for x in section["nonPresetUITypeIds"]
        ]

    return new_sections, section_id_map


def copy_sections_and_other_info(x):
    new_code_info, code_info_id_map = copy_code_info(x["codeInfo"])
    new_ev_cols, ev_col_id_map = copy_ev_cols(x["evCols"], code_info_id_map)
    new_ui_types, ui_type_id_map = copy_ui_types(x["uiTypes"], code_info_id_map)
    new_ui_type_cols, ui_type_col_id_map = copy_ui_type_cols(
        x["uiTypeCols"], ui_type_id_map, code_info_id_map
    )
    new_sections, section_id_map = copy_sections(
        x["sections"],
        code_info_id_map,
        ev_col_id_map,
        ui_type_id_map,
        ui_type_col_id_map,
    )

    return {
        "codeInfo": new_code_info,
        "evCols": new_ev_cols,
        "uiTypes": new_ui_types,
        "uiTypeCols": new_ui_type_cols,
        "sections": new_sections,
        "section_id_map": section_id_map,
    }


def copy_relative_positions(relative_positions, section_id_map):
    return rename_keys(relative_positions, section_id_map)
