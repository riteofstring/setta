import typing
import inspect
from . import common_functions as c_f

REF_KEYWORD: typing.Final = "~REF~"
DO_NOT_INIT_KEYWORD: typing.Final = "~DO_NOT_INIT~"
UNKNOWN_UI_TYPE: typing.Final = "UNKNOWN"


class Category:
    ui_type: typing.Final = "CATEGORY"

    def __init__(self, module):
        self.module = module

    def __repr__(self):
        descriptor = (
            "{}{}".format(REF_KEYWORD, self.module)
            if isinstance(self.module, str)
            else self.module.__name__
        )
        return "Category:{}".format(descriptor)


ORIGINAL_TYPE_MAP: typing.Final = {
    type(None): "NONE",
    bool: "BOOL",
    str: "TEXT",
    int: "INT",
    float: "FLOAT",
    tuple: "TUPLE",
    list: "LIST",
    dict: "DICT",
    Ellipsis: "...",
    typing.Union: "EITHER",
    Category: Category.ui_type,
}


class TypeMap:
    CUSTOM_TYPE_MAP = {}
    ALIAS = {}

    @property
    def UI_TYPE_MAP(self):
        return c_f.merge_dicts(ORIGINAL_TYPE_MAP, self.CUSTOM_TYPE_MAP)

    def register(self, py_type, ui_type):
        self.CUSTOM_TYPE_MAP[py_type] = ui_type

    def register_alias(self, py_type, alias):
        self.ALIAS[py_type] = alias

    def get_ui_type(self, input_type):
        input_type = self.ALIAS.get(input_type, input_type)
        if isinstance(input_type, Category):
            input_type = type(input_type)
        sub_types = typing.get_args(input_type)
        if len(sub_types) == 0:
            return self.UI_TYPE_MAP.get(input_type, UNKNOWN_UI_TYPE)
        wrapper_type = typing.get_origin(input_type)
        return {
            self.UI_TYPE_MAP.get(wrapper_type, UNKNOWN_UI_TYPE): [
                self.get_ui_type(k) for k in sub_types
            ]
            if len(sub_types) > 1
            else self.get_ui_type(sub_types[0])
        }


TYPE_MAP = TypeMap()
