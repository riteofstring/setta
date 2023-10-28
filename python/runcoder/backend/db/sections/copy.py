from ...utils.utils import remap_ids


def copy_sections(
    sections, code_info_id_map, ev_col_id_map, ui_type_id_map, ui_type_col_id_map
):
    new_sections, section_id_map = remap_ids(sections)
    for section in new_sections.values():
        section["id"] = section_id_map[section["id"]]
        section["children"] = [section_id_map[x] for x in section["children"]]
        if section.get("selectedItem"):
            section["selectedItem"] = code_info_id_map[section["selectedItem"]]
        if section.get("paramInfoId"):
            section["paramInfoId"] = code_info_id_map[section["paramInfoId"]]
        section["evColId"] = ev_col_id_map[section["evColId"]]
        section["uiTypeId"] = ui_type_id_map[section["uiTypeId"]]
        section["uiTypeColId"] = ui_type_col_id_map[section["uiTypeColId"]]
        section["nonPresetUITypeIds"] = [
            ui_type_id_map[x] for x in section["nonPresetUITypeIds"]
        ]

    return new_sections, section_id_map
