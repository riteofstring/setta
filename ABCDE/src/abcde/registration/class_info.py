from ..utils import common_functions as c_f
from ..utils.type_map import TYPE_MAP, NestedObject
from .base_info import BaseInfo
import json


class ClassInfo(BaseInfo):
    def __init__(self, input_class, include=(), exclude=()):
        if not c_f.is_class_or_function(input_class):
            raise TypeError("Input to ClassInfo must be a class or function")
        self.cls = input_class
        cls_args = c_f.get_args(self.cls)
        self.cls_args = {
            k: (
                {
                    "default": v.default,
                    "type": v.annotation,
                    "ui_type": TYPE_MAP.get_ui_type(v.annotation, v.kind),
                }
            )
            for k, v in cls_args.items()
            if self.should_be_included(k, include, exclude)
        }

    def as_dict(self):
        for k1, v1 in self.cls_args.items():
            for k2, v2 in v1.items():
                if isinstance(v2, NestedObject):
                    v1[k2] = v2.description()
                else:
                    v1[k2] = c_f.type_to_str(v2)
        output = {
            "name": self.cls.__name__,
            "args": self.cls_args,
        }
        return output

    def set_type(self, arg_name, new_type):
        if isinstance(new_type, str):
            new_type = c_f.str_to_builtin_type(new_type)
        self.cls_args[arg_name]["type"] = new_type
        self.cls_args[arg_name]["ui_type"] = TYPE_MAP.get_ui_type(new_type)
