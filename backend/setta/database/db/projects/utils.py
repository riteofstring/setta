import copy

from setta.utils.constants import DEFAULT_VALUES


def with_project_config_defaults(**kwargs):
    return {**copy.deepcopy(DEFAULT_VALUES["projectConfig"]), **kwargs}
