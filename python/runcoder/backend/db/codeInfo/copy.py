from runcoder.backend.utils.utils import remap_ids


def copy_code_info(code_info):
    new_code_info, code_info_id_map = remap_ids(code_info)

    for c in new_code_info.values():
        c["id"] = code_info_id_map[c["id"]]
        c["children"] = [code_info_id_map[x] for x in c["children"]]

    return new_code_info, code_info_id_map
