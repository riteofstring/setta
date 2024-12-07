import copy
from unittest.mock import DEFAULT

from setta.database.utils import create_new_id
from setta.utils.constants import DEFAULT_VALUES
from setta.utils.generate_memorable_string import generate_memorable_string


def new_section_variant(**kwargs):
    id = create_new_id()
    name = kwargs.get("name", generate_memorable_string())
    codeInfoColId = kwargs.get("codeInfoColId", create_new_id())
    obj = with_section_variant_defaults(name=name, codeInfoColId=codeInfoColId)
    return id, obj


def with_section_variant_defaults(**kwargs):
    return {**copy.deepcopy(DEFAULT_VALUES["sectionVariant"]), **kwargs}


def add_defaults_to_section_variants(section_variants):
    for k, v in section_variants.items():
        section_variants[k] = with_section_variant_defaults(**v)


def with_ev_defaults(**kwargs):
    return {**copy.deepcopy(DEFAULT_VALUES["ev"]), **kwargs}


def new_ev_entry(**kwargs):
    return with_ev_defaults(**kwargs)
