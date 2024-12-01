import copy

from setta.utils.constants import DEFAULT_VALUES
from setta.utils.utils import replace_null_keys_with_none


def with_code_info_defaults(**kwargs):
    return {**copy.deepcopy(DEFAULT_VALUES["codeInfo"]), **kwargs}


def add_defaults_to_code_info(code_info):
    for k, v in code_info.items():
        code_info[k] = with_code_info_defaults(**v)


def with_code_info_col_defaults(**kwargs):
    return {
        **replace_null_keys_with_none(copy.deepcopy(DEFAULT_VALUES["codeInfoCol"])),
        **kwargs,
    }


def add_defaults_to_code_info_cols(code_info_cols):
    for k, v in code_info_cols.items():
        code_info_cols[k] = with_code_info_col_defaults(**v)
