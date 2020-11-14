import typing
import inspect
from inspect import Parameter
import importlib
from . import common_functions as c_f
from . import yaml_parsing as yp
from .constants import UNKNOWN_UI_TYPE, REF_KEYWORD


class NestedObject:
    ui_type = "NESTED_OBJECT"

    def __init__(self, module_infos):
        self.module_infos = module_infos

    def description(self):
        if isinstance(self.module_infos, str):
            return "{}{}".format(REF_KEYWORD, self.module_infos)
        else:
            out_dict = {}
            for m in self.module_infos:
                print(m)
                out_dict = c_f.merge_dicts(out_dict, m.as_dict())
            return out_dict


class ListNestedObject(NestedObject):
    ui_type = "LIST_NESTED_OBJECT"


class DictNestedObject(NestedObject):
    ui_type = "DICT_NESTED_OBJECT"


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
    NestedObject: NestedObject.ui_type,
    ListNestedObject: ListNestedObject.ui_type,
    DictNestedObject: DictNestedObject.ui_type,
    Parameter.VAR_KEYWORD: "TEXT",
}


class TypeMap:
    CUSTOM_TYPE_MAP = {}

    @property
    def UI_TYPE_MAP(self):
        return c_f.merge_dicts(ORIGINAL_TYPE_MAP, self.CUSTOM_TYPE_MAP)

    def register(self, py_type, ui_type):
        if isinstance(py_type, str):
            py_type = yp.string_to_attr(py_type)
        self.CUSTOM_TYPE_MAP[py_type] = ui_type

    def register_multiple(self, py_types, ui_type):
        for p in py_types:
            self.register(p, ui_type)

    def register_from_dict(self, input_dict):
        for ui_type, py_types in input_dict.items():
            self.register_multiple(py_types, ui_type)

    def get_ui_type(self, input_type, input_kind=None):
        if input_kind is not None:
            return self.UI_TYPE_MAP.get(input_kind, UNKNOWN_UI_TYPE)
        else:
            if isinstance(input_type, NestedObject):
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
