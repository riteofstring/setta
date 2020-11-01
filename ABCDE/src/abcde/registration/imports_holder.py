import importlib
from ..utils import yaml_parsing as yp


class ImportsHolder:
    def set_import(self, name, package=None):
        if package is not None:
            parent_module = importlib.import_module(package)
            imported_module = getattr(parent_module, name)
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

    def get_import(self, x):
        try:
            return getattr(self, x)
        except AttributeError:
            module, attr_name = yp.split_attr_from_modules(x)
            return getattr(getattr(self, module), attr_name)

    def get_imports(self, list_of_imports):
        return {k: self.get_import(k) for k in list_of_imports}
