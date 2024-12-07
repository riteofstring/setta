import copy

from setta.utils.constants import DEFAULT_VALUES, SECTION_ARTIFACTS_TABLE_DATA_JSON_FIELDS, SECTION_TABLE_DATA_JSON_FIELDS
from setta.utils.utils import filter_dict_and_remove_from_original


def with_section_defaults(**kwargs):
    return {**copy.deepcopy(DEFAULT_VALUES["section"]), **kwargs}


def add_defaults_to_sections(sections):
    for k, v in sections.items():
        sections[k] = with_section_defaults(**v)


def add_data_column_to_sections(sections):
    for k, v in sections.items():
        v["data"] = filter_dict_and_remove_from_original(
            v, SECTION_TABLE_DATA_JSON_FIELDS, DEFAULT_VALUES["section"]
        )
        for a in v["artifacts"]:
            a["data"] = filter_dict_and_remove_from_original(a, SECTION_ARTIFACTS_TABLE_DATA_JSON_FIELDS)