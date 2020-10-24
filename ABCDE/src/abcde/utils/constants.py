import typing

UI_TYPE_MAP = {
    type(None): "NONE",
    str: "TEXT",
    int: "INT",
    float: "FLOAT",
    tuple: "TUPLE",
    list: "LIST",
    dict: "DICT",
    Ellipsis: "...",
    typing.Union: "EITHER",
    object: "SUBCATEGORY",
}
REF_KEYWORD = "~REF~"
DO_NOT_INIT_KEYWORD = "~DO_NOT_INIT~"


def get_ui_type(input_type):
    print("input_type", input_type)
    sub_types = typing.get_args(input_type)
    if len(sub_types) == 0:
        return UI_TYPE_MAP.get(input_type, "UNKNOWN")
    wrapper_type = typing.get_origin(input_type)
    print("wrapper_type", wrapper_type)
    print("sub_types", sub_types)
    output = {UI_TYPE_MAP[wrapper_type]: [get_ui_type(k) for k in sub_types]}
    for k, v in output.items():
        if type(v) is list and len(v) == 1:
            output[k] = v[0]
    return output
