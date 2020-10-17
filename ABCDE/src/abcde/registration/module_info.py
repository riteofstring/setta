from ..utils import common_functions as c_f
from ..utils import constants as const


class ModuleInfo:
    def __init__(self, module):
        self.module = module
        module_init_args = c_f.get_init_arguments(self.module)
        self.module_init_args = {
            k: (
                {
                    "default": v.default,
                    "type": v.annotation,
                    "ui_type": const.get_ui_type(v.annotation),
                }
            )
            for k, v in module_init_args.items()
        }
        self.expose_list = list(self.module_init_args.keys())

    def expose(self, e):
        if isinstance(e, str):
            self.expose_list = [e]
        else:
            assert isinstance(e, (list, tuple))
            assert all(k in self.module_init_args for k in e)
            self.expose_list = e
