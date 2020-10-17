UI_TYPE_MAP = {str: "TEXT_BOX", int: "TEXT_BOX", float: "TEXT_BOX", list: "DROPDOWN"}
REF_KEYWORD = "~REF~"
DO_NOT_INIT_KEYWORD = "~DO_NOT_INIT~"


def get_ui_type(input_type):
    return UI_TYPE_MAP.get(input_type, "TEXT_BOX")
