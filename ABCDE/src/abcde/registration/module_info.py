from ..utils import common_functions as c_f


class ModuleInfo:
    def __init__(self, module, expose=None):
        self.module = module
        self.module_init_args = c_f.get_init_arguments(self.module)
        if expose is None:
            self.expose = list(self.module_init_args.keys())
        else:
            assert isinstance(expose, (list, tuple))
            assert all(k in self.module_init_args for k in expose)
            self.expose = expose
