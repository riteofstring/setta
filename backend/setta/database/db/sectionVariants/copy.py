from setta.database.utils import remap_ids, rename_keys


def copy_section_variants(section_variants, section_id_map, code_info_id_map):
    new_section_variants, section_variant_id_map = remap_ids(section_variants)

    for id, obj in new_section_variants.items():
        # obj["name"] = // TODO generate new name
        obj["children"] = [section_id_map[x] for x in obj["children"]]
        obj["values"] = rename_keys(obj["values"], code_info_id_map)

    return new_section_variants, section_variant_id_map
