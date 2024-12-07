import copy

from setta.utils.constants import DEFAULT_VALUES
from setta.utils.utils import deep_merge


def new_ui_type_col_entry():
    return copy.deepcopy(DEFAULT_VALUES["uiTypeColEntry"])


def add_defaults_to_ui_type_cols(ui_type_cols):
    for v in ui_type_cols.values():
        for paramId in v.keys():
            v[paramId] = with_ui_type_col_entry_defaults(**v[paramId])


def with_ui_type_col_entry_defaults(**kwargs):
    return deep_merge(copy.deepcopy(DEFAULT_VALUES["uiTypeColEntry"]), kwargs)
