from runcoder.database.utils import remap_ids, rename_keys


def copy_ev_cols(ev_cols, code_info_id_map):
    new_ev_cols, ev_col_id_map = remap_ids(ev_cols)

    for id, obj in new_ev_cols.items():
        # obj["name"] = // TODO generate new name
        obj["values"] = rename_keys(obj["values"], code_info_id_map)

    return new_ev_cols, ev_col_id_map
