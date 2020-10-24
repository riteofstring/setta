from ..utils import common_functions as c_f
from ..utils import constants as const
import json


class ClassInfo:
    def __init__(self, input_class):
        if not c_f.is_class_or_function(input_class):
            raise TypeError("Input to ClassInfo must be a class or function")
        self.cls = input_class
        cls_args = c_f.get_args(self.cls)
        self.cls_args = {
            k: (
                {
                    "default": v.default,
                    "type": v.annotation,
                    "ui_type": const.TYPE_MAP.get_ui_type(v.annotation),
                }
            )
            for k, v in cls_args.items()
        }
        self.expose_list = []

    def expose(self, e):
        if isinstance(e, str):
            self.expose_list = [e]
        else:
            assert isinstance(e, (list, tuple))
            assert all(k in self.cls_args for k in e)
            self.expose_list = e

    def as_dict(self):
        for k1, v1 in self.cls_args.items():
            for k2, v2 in v1.items():
                v1[k2] = c_f.type_to_str(v2)
        output = {
            "name": self.cls.__name__,
            "args": self.cls_args,
            "expose_list": self.expose_list,
        }
        return output

    def as_json(self):
        return json.dumps(self.as_dict())
