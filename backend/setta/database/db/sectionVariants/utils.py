import copy

from setta.database.utils import create_new_id
from setta.utils.constants import DEFAULT_VALUES
from setta.utils.generate_memorable_string import generate_memorable_string
from setta.utils.utils import recursive_dict_merge


def new_section_variant(**kwargs):
    id = kwargs.get("id", create_new_id())
    name = kwargs.get("name", generate_memorable_string())
    codeInfoColId = kwargs.get("codeInfoColId", create_new_id())
    obj = with_section_variant_defaults(name=name, codeInfoColId=codeInfoColId)
    return id, obj


def with_section_variant_defaults(**kwargs):
    return recursive_dict_merge(copy.deepcopy(DEFAULT_VALUES["sectionVariant"]), kwargs)


def add_defaults_to_section_variants(section_variants):
    for k, v in section_variants.items():
        section_variants[k] = with_section_variant_defaults(**v)
        for paramId, valueInfo in section_variants[k]["values"].items():
            section_variants[k][paramId] = with_ev_entry_defaults(**valueInfo)


def with_ev_entry_defaults(**kwargs):
    return recursive_dict_merge(copy.deepcopy(DEFAULT_VALUES["evEntry"]), kwargs)


def new_ev_entry(**kwargs):
    return with_ev_entry_defaults(**kwargs)
