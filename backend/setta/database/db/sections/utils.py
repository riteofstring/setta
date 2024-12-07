import copy

from setta.utils.constants import DEFAULT_VALUES


def with_section_defaults(**kwargs):
    return {**copy.deepcopy(DEFAULT_VALUES["section"]), **kwargs}

