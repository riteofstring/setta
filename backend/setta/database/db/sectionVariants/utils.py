import copy

from setta.database.utils import create_new_id
from setta.utils.constants import DEFAULT_VALUES
from setta.utils.generate_memorable_string import generate_memorable_string


def new_section_variant(**kwargs):
    return {
        "id": create_new_id(),
        "name": generate_memorable_string(),
        "selectedItem": None,
        "code": "",
        "codeInfoColId": create_new_id(),
        "keywordPositions": [],
        "children": [],
        "values": {},
        "isFrozen": False,
        "sweep": [],
        **kwargs,
    }


def with_section_variant_defaults(**kwargs):
    return {**copy.deepcopy(DEFAULT_VALUES["sectionVariant"]), **kwargs}


def add_defaults_to_section_variants(section_variants):
    for k, v in section_variants.items():
        section_variants[k] = with_section_variant_defaults(**v)
