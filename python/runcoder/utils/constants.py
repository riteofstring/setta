import builtins
from types import SimpleNamespace

CODE_FOLDER = "runcoder_code"
PARAMETER = "parameter"
COLLECTION = "collection"
CALLABLE = "callable"

TEXT = "TEXT"
SLIDER = "SLIDER"
SWITCH = "SWITCH"
SECTION = "SECTION"
LIST_ROOT = "LIST_ROOT"
DICT_ROOT = "DICT_ROOT"
DECK = "DECK"
GLOBAL_VARIABLES = "GLOBAL_VARIABLES"
CODE = "CODE"
VAR_CONTROL = "VAR_CONTROL"
INFO = "INFO"
PARAM_SWEEP = "PARAM_SWEEP"
TERMINAL = "TERMINAL"
GLOBAL_PARAM_SWEEP = "GLOBAL_PARAM_SWEEP"

BUILT_INS = set(dir(builtins))


def is_section_ui_type(x):
    return x not in [TEXT, SLIDER, SWITCH]


C = SimpleNamespace()
