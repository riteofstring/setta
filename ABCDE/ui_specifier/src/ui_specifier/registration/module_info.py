import inspect

from ..utils import common_functions as c_f
from .base_info import BaseInfo
from .class_info import ClassInfo


class ModuleInfo(BaseInfo):
    def __init__(self, obj, obj_type=None, include=(), exclude=()):
        if not inspect.ismodule(obj):
            raise TypeError("Input to ModuleInfo must be a module")
        self.module = obj
        self.name = self.module.__name__
        do_classes = obj_type in [None, "classes"]
        do_functions = obj_type in [None, "functions"]

        self.objs = {}

        if do_classes:
            for name, cls in inspect.getmembers(self.module, inspect.isclass):
                if self.should_be_included(name, include, exclude):
                    self.objs[name] = ClassInfo(cls)

        if do_functions:
            for name, func in inspect.getmembers(self.module, inspect.isfunction):
                if self.should_be_included(name, include, exclude):
                    self.objs[name] = ClassInfo(func)

    def as_dict(self):
        output = {self.name: {}}
        for name, cls_info in self.objs.items():
            output[self.name][name] = cls_info.as_dict()
        return output

    def set_type(self, obj_name, arg_name, new_type):
        cls_info = self.objs.get(obj_name, None)
        cls_info.set_type(arg_name, new_type)

    def set_ui_type(self, obj_name, arg_name, new_type):
        cls_info = self.objs.get(obj_name, None)
        cls_info.set_ui_type(arg_name, new_type)

    def set_default(self, obj_name, arg_name, new_default):
        cls_info = self.objs.get(obj_name, None)
        cls_info.set_default(arg_name, new_default)
