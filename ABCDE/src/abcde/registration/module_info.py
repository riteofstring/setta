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
            self.classes[name] = cls
        for name, func in inspect.getmembers(self.module, inspect.isfunction):
            self.functions[name] = func

    def as_dict(self, input_type=None):
        assert input_type in ["classes", "functions", None]
        input_type = (
            [input_type] if input_type is not None else ["classes", "functions"]
        )
        output = {self.module.__name__: {k: {} for k in input_type}}
        for T in input_type:
            for name, func in getattr(self, T).items():
                output[self.module.__name__][T][name] = ClassInfo(func).as_dict()
        return output

    def as_json(self, input_type):
        return json.dumps(self.as_dict(input_type))
