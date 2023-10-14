from ...utils.utils import remap_ids, rename_keys


def copy_ev_cols(ev_cols, code_info_id_map):
    new_ev_cols, ev_col_id_map = remap_ids(ev_cols)

    for id in new_ev_cols.keys():
        new_ev_cols[id] = rename_keys(new_ev_cols[id], code_info_id_map)

    return new_ev_cols, ev_col_id_map
