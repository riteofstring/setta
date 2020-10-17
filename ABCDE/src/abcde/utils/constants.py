UI_TYPE_MAP = {str: "TEXT_BOX", int: "TEXT_BOX", float: "TEXT_BOX", list: "DROPDOWN"}


def get_ui_type(input_type):
    if input_type in UI_TYPE_MAP:
        return UI_TYPE_MAP[input_type]
    return "TEXT_BOX"
