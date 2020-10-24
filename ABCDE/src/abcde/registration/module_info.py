from ..utils import common_functions as c_f
from ..utils import constants as const
from .class_info import ClassInfo
import json
import inspect


class ModuleInfo:
    def __init__(self, input_module):
        if not inspect.ismodule(input_module):
            raise TypeError("Input to ModuleInfo must be a module")
        self.module = input_module
        self.classes = {}
        self.functions = {}
        for name, cls in inspect.getmembers(self.module, inspect.isclass):
            self.classes[name] = ClassInfo(cls)
        for name, func in inspect.getmembers(self.module, inspect.isfunction):
            self.functions[name] = ClassInfo(func)
        self.obj_types = ["classes", "functions"]

    def as_dict(self, obj_type=None):
        assert obj_type in self.obj_types + [None]
        obj_type = [obj_type] if obj_type is not None else self.obj_types
        output = {self.module.__name__: {k: {} for k in obj_type}}
        for T in obj_type:
            for name, cls_info in getattr(self, T).items():
                output[self.module.__name__][T][name] = cls_info.as_dict()
        return output

    def as_json(self, obj_type=None):
        return json.dumps(self.as_dict(obj_type))

    def set_type(self, obj_name, arg_name, new_type, obj_type=None):
        assert obj_type in self.obj_types + [None]
        obj_type = [obj_type] if obj_type is not None else self.obj_types
        for k in obj_type:
            cls_info = getattr(self, k).get(obj_name, None)
            if cls_info is not None:
                cls_info.set_type(arg_name, new_type)
                break
