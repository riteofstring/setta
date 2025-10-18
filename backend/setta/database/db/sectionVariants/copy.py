from setta.database.utils import remap_ids, rename_keys
from setta.utils.generate_memorable_string import generate_memorable_string


def copy_section_variants(section_variants, code_info_id_map, code_info_col_id_map):
    new_section_variants, section_variant_id_map = remap_ids(section_variants)

    for obj in new_section_variants.values():
        if not obj["isJsonSource"]:
            obj["name"] = generate_memorable_string()
        obj["values"] = rename_keys(obj["values"], code_info_id_map)
        if obj["codeInfoColId"]:
            obj["codeInfoColId"] = code_info_col_id_map[obj["codeInfoColId"]]
        if obj["selectedItem"]:
            obj["selectedItem"] = code_info_id_map[obj["selectedItem"]]

    return new_section_variants, section_variant_id_map


def update_section_variant_children(section_variants, section_id_map):
    for obj in section_variants.values():
        obj["children"] = [section_id_map[x] for x in obj["children"]]
