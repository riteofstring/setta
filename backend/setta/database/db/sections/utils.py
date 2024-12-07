import copy

from setta.utils.constants import DEFAULT_VALUES
from setta.utils.utils import deep_merge


def with_section_defaults(**kwargs):
    return deep_merge(copy.deepcopy(DEFAULT_VALUES["section"]), kwargs)


def add_defaults_to_sections(sections):
    for k, v in sections.items():
        sections[k] = with_section_defaults(**v)
