import copy

from setta.utils.constants import DEFAULT_VALUES


def with_code_info_defaults(**kwargs):
    return {**copy.deepcopy(DEFAULT_VALUES["codeInfo"]), **kwargs}


def add_defaults_to_code_info(code_info):
    for k, v in code_info.items():
        code_info[k] = with_code_info_defaults(**v)
