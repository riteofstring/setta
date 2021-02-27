import re

from ..utils import common_functions as c_f
from ..utils import yaml_parsing as yp
from ..utils.constants import REGEX_KEYWORD


class BaseInfo:
    def is_in_list(self, k, checklist):
        for L in checklist:
            if L.startswith(REGEX_KEYWORD):
                L = L.replace(REGEX_KEYWORD, "")
                if re.search(L, k):
                    return True
            elif k == L:
                return True
        return False

    def should_be_included(self, k, include, exclude):
        if len(include) > 0:
            return self.is_in_list(k, include)
        if len(exclude) > 0:
            return not self.is_in_list(k, exclude)
        return True

    def str_to_type(self, x):
        if isinstance(x, str):
            try:
                return c_f.str_to_builtin_type(x)
            except AttributeError:
                return yp.string_to_attr(x)
        return x
