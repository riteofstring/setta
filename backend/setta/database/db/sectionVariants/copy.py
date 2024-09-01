from setta.database.utils import remap_ids, rename_keys


def copy_section_variants(section_variants, code_info_id_map):
    new_section_variants = {}
    section_variant_id_map = {}

    for dbSource, curr_variants in section_variants.items():
        curr_new_variants, curr_variant_id_map = remap_ids(curr_variants)

        for obj in curr_new_variants.values():
            # obj["name"] = // TODO generate new name
            obj["values"] = rename_keys(obj["values"], code_info_id_map)
            if obj["selectedItem"]:
                obj["selectedItem"] = code_info_id_map[obj["selectedItem"]]

        new_section_variants[dbSource] = curr_new_variants
        section_variant_id_map[dbSource] = curr_variant_id_map

    return new_section_variants, section_variant_id_map


def update_section_variant_children(section_variants, section_id_map):
    for curr_variants in section_variants.values():
        for obj in curr_variants.values():
            obj["children"] = [section_id_map[x] for x in obj["children"]]
