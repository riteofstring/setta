import importlib
import inspect

from ..utils import yaml_parsing as yp


class ImportsHolder:
    def set_import(self, name, package=None):
        if package is not None:
            imported_module = importlib.import_module("{}.{}".format(package, name))
        else:
            imported_module = importlib.import_module(name)
        setattr(self, name, imported_module)

    def set_imports(self, dict_of_imports):
        for k, v in dict_of_imports.items():
            assert v is None or type(v) is list
            if type(v) is list:
                for name in v:
                    self.set_import(name, k)
            else:
                self.set_import(k)

    # returns parent module name and the desired module
    def get_import(self, x):
        try:
            module = getattr(self, x)
            return module.__name__, module
        except AttributeError:
            module, attr_name = yp.split_attr_from_modules(x)
            try:
                curr_module = getattr(self, module)
                return curr_module.__name__, getattr(curr_module, attr_name)
            except AttributeError:
                return self.get_nested_import(module, attr_name)

    def get_imports(self, list_of_imports):
        return {k: self.get_import(k) for k in list_of_imports}

    def get_nested_import(self, module, attr_name):
        modules = module.split(".")
        i = 0
        for i in range(1, len(modules)):
            top_level_module = ".".join(modules[:i])
            nested_module = modules[i]
            try:
                curr_module = getattr(getattr(self, top_level_module), nested_module)
                break
            except AttributeError:
                pass
        for j in range(i + 1, len(modules)):
            nested_module = modules[j]
            curr_module = getattr(curr_module, nested_module)
        return curr_module.__name__, getattr(curr_module, attr_name)
