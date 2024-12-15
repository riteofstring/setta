import copy

from setta.utils.constants import DEFAULT_VALUES
from setta.utils.utils import recursive_dict_merge


def with_section_defaults(**kwargs):
    return recursive_dict_merge(copy.deepcopy(DEFAULT_VALUES["section"]), kwargs)


def add_defaults_to_sections(sections):
    for k, v in sections.items():
        sections[k] = with_section_defaults(**v)


def process_loaded_section_size(x):
    return "auto" if x is None else x


def process_section_size_for_saving(x):
    return None if x == "auto" else x
