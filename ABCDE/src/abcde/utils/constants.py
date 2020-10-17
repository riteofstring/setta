UI_TYPE_MAP = {str: "TEXT_BOX", int: "TEXT_BOX", float: "TEXT_BOX", list: "DROPDOWN"}
REF_KEYWORD = "~REF~"


def get_ui_type(input_type):
    return UI_TYPE_MAP.get(input_type, "TEXT_BOX")
