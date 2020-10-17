from ..utils import common_functions as c_f
from ..utils import constants as const
import json
import inspect


class ModuleInfo:
    def __init__(self, input_module):
        if not inspect.ismodule(input_module):
            raise TypeError("Input to ModuleInfo must be a module")
        self.module = input_module
        self.sub_modules = {}
        self.classes = {}
        self.functions = {}
        for name, module in inspect.getmembers(self.module, inspect.ismodule):
            self.sub_modules[name] = module
        for name, cls in inspect.getmembers(self.module, inspect.isclass):
            self.classes[name] = cls
        for name, func in inspect.getmembers(self.module, inspect.isfunction):
            self.functions[name] = func
