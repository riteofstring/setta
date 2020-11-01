from ..utils import common_functions as c_f
from .class_info import ClassInfo
from .base_info import BaseInfo
import json
import inspect


class ModuleInfo(BaseInfo):
    def __init__(self, input_module, obj_type=None, include=(), exclude=()):
        if not inspect.ismodule(input_module):
            raise TypeError("Input to ModuleInfo must be a module")
        self.module = input_module
        self.name = self.module.__name__
        do_classes = obj_type in [None, "classes"]
        do_functions = obj_type in [None, "functions"]

        if do_classes:
            self.classes = {}
            for name, cls in inspect.getmembers(self.module, inspect.isclass):
                if self.should_be_included(name, include, exclude):
                    self.classes[name] = ClassInfo(cls)

        if do_functions:
            self.functions = {}
            for name, func in inspect.getmembers(self.module, inspect.isfunction):
                if self.should_be_included(name, include, exclude):
                    self.functions[name] = ClassInfo(func)

        self.obj_types = ["classes", "functions"] if obj_type is None else [obj_type]

    def as_dict(self, obj_type=None):
        assert obj_type in self.obj_types + [None]
        obj_type = [obj_type] if obj_type is not None else self.obj_types
        output = {self.name: {k: {} for k in obj_type}}
        for T in obj_type:
            for name, cls_info in getattr(self, T).items():
                output[self.name][T][name] = cls_info.as_dict()
        return output

    def set_type(self, obj_name, arg_name, new_type, obj_type=None):
        assert obj_type in self.obj_types + [None]
        obj_type = [obj_type] if obj_type is not None else self.obj_types
        for k in obj_type:
            cls_info = getattr(self, k).get(obj_name, None)
            if cls_info is not None:
                cls_info.set_type(arg_name, new_type)
                break
