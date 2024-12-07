import copy

from setta.database.utils import create_new_id
from setta.utils.constants import DEFAULT_VALUES, SECTION_VARIANT_ID_TABLE_DATA_JSON_FIELDS
from setta.utils.generate_memorable_string import generate_memorable_string
from setta.utils.utils import filter_dict_and_remove_from_original


def new_section_variant(**kwargs):
    id = kwargs.get("id", create_new_id())
    name = kwargs.get("name", generate_memorable_string())
    codeInfoColId = kwargs.get("codeInfoColId", create_new_id())
    obj = with_section_variant_defaults(name=name, codeInfoColId=codeInfoColId)
    return id, obj


def with_section_variant_defaults(**kwargs):
    return {**copy.deepcopy(DEFAULT_VALUES["sectionVariant"]), **kwargs}


def add_defaults_to_section_variants(section_variants):
    for k, v in section_variants.items():
        section_variants[k] = with_section_variant_defaults(**v)


def add_data_column_to_section_variants(sections):
    for k, v in sections.items():
        sections[k]["data"] = filter_dict_and_remove_from_original(
            v, SECTION_VARIANT_ID_TABLE_DATA_JSON_FIELDS, DEFAULT_VALUES["sectionVariant"]
        )

def with_ev_entry_defaults(**kwargs):
    return {**copy.deepcopy(DEFAULT_VALUES["evEntry"]), **kwargs}


def new_ev_entry(**kwargs):
    return with_ev_entry_defaults(**kwargs)


