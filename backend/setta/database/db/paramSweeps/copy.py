from setta.database.utils import remap_ids

def copy_param_sweeps(param_sweeps, code_info_id_map):
    new_param_sweeps, param_sweep_id_map = remap_ids(param_sweeps)

    for v in new_param_sweeps.values():
        for s in v["sweep"]:
            if s["selectedItem"]:
                s["selectedItem"] = code_info_id_map[s["selectedItem"]]
            for p in s["params"]:
                p["paramInfoId"] = code_info_id_map[p["paramInfoId"]]

    return new_param_sweeps, param_sweep_id_map


