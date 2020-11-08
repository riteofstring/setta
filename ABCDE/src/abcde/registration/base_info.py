from ..utils import common_functions as c_f, yaml_parsing as yp


class BaseInfo:
    def should_be_included(self, k, include, exclude):
        if len(include) > 0:
            return k in include
        if len(exclude) > 0:
            return k not in exclude
        return True

    def str_to_type(self, x):
        if isinstance(x, str):
            try:
                return c_f.str_to_builtin_type(x)
            except AttributeError:
                return yp.string_to_attr(x)
