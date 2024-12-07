from setta.database.utils import create_new_id
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
